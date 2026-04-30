async function handleResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const errorMessage = payload?.error || payload?.message || `${response.status} ${response.statusText}`
    throw new Error(errorMessage)
  }
  return payload
}

export async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('authToken') ? { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } : {})
    },
    body: JSON.stringify(body),
  })

  return handleResponse(response)
}

export async function postForm(path, formData) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      ...(localStorage.getItem('authToken') ? { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } : {})
    },
    body: formData,
  })

  return handleResponse(response)
}
