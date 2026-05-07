import { postForm, postJson } from './client'

export const startInterviewSession = ({ jobDescription, background, topics, userId, hasResume, hasJobDesc }) => {
  return postJson('/api/session/start', {
    job_description: jobDescription,
    background,
    topics,
    user_id: userId,
    hasResume,
    hasJobDesc
  })
}

export const respondInterviewSession = ({ sessionId, response }) => {
  return postJson('/api/session/respond', {
    session_id: sessionId,
    response,
  })
}

export const respondInterviewSessionAudio = ({ sessionId, audioBlob, filename = 'response.webm' }) => {
  const formData = new FormData()
  formData.append('session_id', sessionId)
  formData.append('audio', audioBlob, filename)
  return postForm('/api/session/respond', formData)
}

export const endInterviewSession = ({ sessionId }) => {
  return postJson('/api/session/end', {
    session_id: sessionId,
  })
}
