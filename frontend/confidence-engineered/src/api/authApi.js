import { getApiUrl } from "./client";

export async function registerUser(email, password, name, role) {
  const response = await fetch(getApiUrl("/api/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
  });
  return response.json();
}

export async function loginUser(email, password) {
  const response = await fetch(getApiUrl("/api/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return response.json();
}

export async function googleLoginUser(credential) {
  const response = await fetch(getApiUrl("/api/auth/google"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  return response.json();
}