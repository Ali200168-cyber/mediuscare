import { API_URL } from "../../config/api";

export const patientFetch = (path, opts = {}) => {
  const token = localStorage.getItem("token");
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  return fetch(url, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};
