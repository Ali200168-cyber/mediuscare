import { useEffect, useRef, useState } from "react";
import CaregiverLayout from "./CaregiverLayout";
import {
  CgHero,
  CgCard,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  CgSectionTitle,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

export default function CaregiverChat() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    caregiverFetch("/api/caregiver/messages/doctors")
      .then((r) => r.json())
      .then((docData) => {
        if (docData.success) setDoctors(docData.doctors || []);
      })
      .catch(() => setError("Failed to load doctors"))
      .finally(() => setLoading(false));
  }, []);

  const loadMessages = (showLoader = false) => {
    if (!selectedDoctor) return;
    if (showLoader) setLoadingMsgs(true);
    caregiverFetch(`/api/caregiver/messages/${selectedDoctor}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message);
        setMessages(data.messages || []);
      })
      .catch((e) => setError(e.message || "Failed to load messages"))
      .finally(() => {
        if (showLoader) setLoadingMsgs(false);
      });
  };

  useEffect(() => {
    if (!selectedDoctor) return;
    setError("");
    loadMessages(true);
    const id = setInterval(() => loadMessages(false), 8000);
    return () => clearInterval(id);
  }, [selectedDoctor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!selectedDoctor || !text.trim()) return;
    setSending(true);
    try {
      const res = await caregiverFetch(`/api/caregiver/messages/${selectedDoctor}`, {
        method: "POST",
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      if (data.message) setMessages((m) => [...m, data.message]);
      setText("");
    } catch (e) {
      setError(e.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const activeDoc = doctors.find((d) => String(d.doctorId) === String(selectedDoctor));

  return (
    <CaregiverLayout>
      <div className="cg-page">
        <CgHero
          variant="chat"
          eyebrow="Care team"
          title="Message their doctor"
          subtitle="Stay aligned with physicians who care for your loved ones."
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}

        {loading ? (
          <CgLoading />
        ) : doctors.length === 0 ? (
          <CgEmpty title="No doctors" message="Patients need an assigned doctor before you can chat." />
        ) : (
          <div className="cg-chat-layout">
            <aside className="cg-chat-sidebar-panel">
              <CgSectionTitle>Conversations</CgSectionTitle>
              <ul className="cg-chat-list">
                {doctors.map((d) => (
                  <li key={d.doctorId}>
                    <button
                      type="button"
                      className={String(selectedDoctor) === String(d.doctorId) ? "is-active" : ""}
                      onClick={() => setSelectedDoctor(String(d.doctorId))}
                    >
                      <strong>{d.name}</strong>
                      <small>{d.specialty}</small>
                      <small>Patient: {d.patientName}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="cg-chat-main-panel">
              {!selectedDoctor ? (
                <CgEmpty title="Select a doctor" message="Choose a conversation to begin messaging." />
              ) : (
                <>
                  <h3 className="cg-chat-thread-title">
                    {activeDoc?.name} · caring for {activeDoc?.patientName}
                  </h3>
                  {loadingMsgs ? (
                    <CgLoading text="Loading messages…" />
                  ) : (
                    <div className="cg-chat-messages">
                      {messages.length === 0 ? (
                        <p className="cg-hint">No messages yet — say hello to start.</p>
                      ) : (
                        messages.map((m) => {
                          const mine = String(m.senderId) !== String(selectedDoctor);
                          return (
                            <div
                              key={m._id}
                              className={`cg-bubble${mine ? " cg-bubble--sent" : " cg-bubble--recv"}`}
                            >
                              <p>{m.content}</p>
                              <time>{new Date(m.createdAt).toLocaleString()}</time>
                            </div>
                          );
                        })
                      )}
                      <div ref={bottomRef} />
                    </div>
                  )}
                  <form className="cg-chat-form" onSubmit={send}>
                    <input
                      type="text"
                      placeholder="Write your message…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <CgButton type="submit" disabled={sending}>
                      Send
                    </CgButton>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </CaregiverLayout>
  );
}
