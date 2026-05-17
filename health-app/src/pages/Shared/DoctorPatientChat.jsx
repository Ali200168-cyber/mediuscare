import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../../config/api";
import "../../styles/Shared/DoctorPatientChat.css";

const fetchWithAuth = (url, opts = {}) => {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

const isCaregiverContact = (contact) => contact?.contactType === "caregiver";

export default function DoctorPatientChat() {
  const [contacts, setContacts] = useState([]);
  const [activeContactId, setActiveContactId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const listEndRef = useRef(null);
  const socketRef = useRef(null);

  const currentUserRole = localStorage.getItem("role");
  const isDoctor = currentUserRole === "doctor";

  const activeContact = useMemo(
    () => contacts.find((item) => String(item._id) === String(activeContactId)) || null,
    [contacts, activeContactId],
  );

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadContacts = async () => {
      setStatus("");
      try {
        const res = await fetchWithAuth(`${API_URL}/api/v1/chat/contacts`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to load contacts.");

        let merged = (data.contacts || []).map((c) => ({
          ...c,
          _id: String(c._id),
          contactType: "patient",
        }));

        if (isDoctor) {
          const cgRes = await fetchWithAuth(`${API_URL}/api/doctor/caregiver-contacts`);
          const cgData = await cgRes.json();
          if (cgData.success && cgData.contacts?.length) {
            merged = [...merged, ...cgData.contacts];
          }
        }

        setContacts(merged);
        if (merged.length) setActiveContactId(String(merged[0]._id));
      } catch (err) {
        setStatus(err.message || "Failed to load contacts.");
      }
    };
    loadContacts();
  }, [isDoctor]);

  useEffect(() => {
    if (!activeContactId || !activeContact) return;

    const loadMessages = async () => {
      setLoading(true);
      setStatus("");
      try {
        if (isCaregiverContact(activeContact)) {
          const res = await fetchWithAuth(
            `${API_URL}/api/doctor/caregiver-messages/${activeContact.caregiverId}?patientId=${activeContact.patientId}`,
          );
          const data = await res.json();
          if (!data.success) throw new Error(data.message || "Failed to load messages.");
          setMessages(
            (data.messages || []).map((m) => ({
              _id: m._id,
              senderId: m.senderId,
              text: m.content,
              createdAt: m.createdAt,
            })),
          );
        } else {
          const res = await fetchWithAuth(`${API_URL}/api/v1/chat/messages/${activeContactId}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.message || "Failed to load messages.");
          setMessages(data.messages || []);
        }
      } catch (err) {
        setStatus(err.message || "Failed to load messages.");
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };
    loadMessages();
    if (activeContact && isCaregiverContact(activeContact)) {
      const id = setInterval(loadMessages, 8000);
      return () => clearInterval(id);
    }
    return undefined;
  }, [activeContactId, activeContact]);

  useEffect(() => {
    if (!activeContact || isCaregiverContact(activeContact)) return undefined;

    const token = localStorage.getItem("token");
    if (!token) return undefined;

    const socket = io(API_URL, {
      transports: ["websocket"],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("chat:new", (payload) => {
      const incoming = payload?.message;
      if (!incoming) return;
      const belongsToConversation =
        String(incoming.doctorId) === String(activeContactId) || String(incoming.patientId) === String(activeContactId);

      if (belongsToConversation) {
        setMessages((prev) => {
          if (prev.some((m) => String(m._id) === String(incoming._id))) return prev;
          return [...prev, incoming];
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeContactId, activeContact]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !activeContactId || !activeContact) return;

    setStatus("");

    if (isCaregiverContact(activeContact)) {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/doctor/caregiver-messages/${activeContact.caregiverId}`, {
          method: "POST",
          body: JSON.stringify({ patientId: activeContact.patientId, content: trimmed }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to send message.");
        const msg = data.message;
        setText("");
        setMessages((prev) => [
          ...prev,
          {
            _id: msg._id,
            senderId: msg.senderId,
            text: msg.content,
            createdAt: msg.createdAt,
          },
        ]);
      } catch (err) {
        setStatus(err.message || "Failed to send message.");
      }
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setStatus("Chat connection is unavailable. Try again in a second.");
      return;
    }

    socket.emit("chat:send", { contactId: activeContactId, text: trimmed }, (ack) => {
      if (!ack?.success) {
        setStatus(ack?.message || "Failed to send message.");
        return;
      }
      setText("");
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(ack.message._id))) return prev;
        return [...prev, ack.message];
      });
    });
  };

  const isMine = (m) => {
    if (isCaregiverContact(activeContact)) {
      return String(m.senderId) !== String(activeContact.caregiverId);
    }
    return String(m.senderId) !== String(activeContactId);
  };

  return (
    <div className="chat-page">
      <div className="chat-layout">
        <aside className="chat-sidebar">
          <h3>{isDoctor ? "Patients & caregivers" : "Assigned doctor"}</h3>
          {contacts.length === 0 ? (
            <p className="chat-muted">No active chat contacts yet.</p>
          ) : (
            contacts.map((contact) => (
              <button
                type="button"
                key={contact._id}
                className={`chat-contact ${String(contact._id) === String(activeContactId) ? "active" : ""}`}
                onClick={() => setActiveContactId(String(contact._id))}
              >
                <span className="chat-contact-name">
                  {contact.name}
                  {isCaregiverContact(contact) && (
                    <span className="chat-contact-tag"> Caregiver</span>
                  )}
                </span>
                <small>
                  {isCaregiverContact(contact)
                    ? `For patient: ${contact.patientName}`
                    : contact.email}
                </small>
              </button>
            ))
          )}
        </aside>

        <section className="chat-main">
          <div className="chat-head">
            <h2>
              {activeContact
                ? isCaregiverContact(activeContact)
                  ? `Chat with ${activeContact.name} (caregiver)`
                  : `Chat with ${activeContact.name}`
                : "Messages"}
            </h2>
            {isCaregiverContact(activeContact) && (
              <span>Regarding patient: {activeContact.patientName}</span>
            )}
            {activeContact?.specialization && <span>{activeContact.specialization}</span>}
          </div>

          <div className="chat-messages">
            {loading ? (
              <p className="chat-muted">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="chat-muted">No messages yet. Say hello to start the conversation.</p>
            ) : (
              messages.map((m) => (
                <div key={m._id} className={`chat-bubble ${isMine(m) ? "mine" : "theirs"}`}>
                  <p>{m.text}</p>
                  <small>{new Date(m.createdAt).toLocaleString()}</small>
                </div>
              ))
            )}
            <div ref={listEndRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a message..."
              maxLength={2000}
              disabled={!activeContactId}
            />
            <button type="submit" disabled={!activeContactId || !text.trim()}>
              Send
            </button>
          </form>
          {status && <div className="chat-status">{status}</div>}
        </section>
      </div>
    </div>
  );
}
