import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

import {
  Alert, AppBar, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Divider, Grid, IconButton, InputAdornment, LinearProgress, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Toolbar, Typography,
} from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import MicRoundedIcon from '@mui/icons-material/MicRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  endInterviewSession, respondInterviewSession, respondInterviewSessionAudio, startInterviewSession,
} from './api/sessionApi'

const MAX_RECORD_SECONDS = 120
const SUGGESTED_TOPICS = ['Teamwork', 'Leadership', 'Conflict Resolution', 'Problem Solving', 'Communication', 'Ownership']
const INITIAL_FORM = {
  jobDescription: 'Senior Software Engineer role building reliable backend APIs and partnering closely with product and design teams.',
  background: 'I am a backend engineer with 3 years of experience in Python, Flask, SQL, and distributed systems.',
  topics: ['Teamwork', 'Leadership', 'Problem Solving'],
}


function normalizeTopic(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function extractSessionId(payload) {
  return payload?.session_id || payload?.sessionId || payload?.data?.session_id || ''
}

function extractInterviewerText(payload) {
  const candidates = [
    payload?.interviewer_message,
    payload?.question,
    payload?.next_question,
    payload?.response,
    payload?.ai_response,
    payload?.message,
    payload?.prompt,
    payload?.data?.interviewer_message,
    payload?.data?.question,
    payload?.data?.response,
  ]
  return candidates.find((item) => typeof item === 'string' && item.trim()) || ''
}

function extractTranscriptText(payload) {
  if (typeof (payload?.transcript || payload?.data?.transcript) === 'string') {
    return (payload?.transcript || payload?.data?.transcript).trim()
  }
  return ''
}

function formatDuration(s) {
  const ms = Math.max(0, Math.min(MAX_RECORD_SECONDS, s || 0))
  const minutes = String(Math.floor(ms / 60)).padStart(2, '0')
  const seconds = String(ms % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function buildFeedbackRows(payload) {
  const source = payload?.scores || payload?.feedback || payload?.data?.feedback || payload
  if (!source || typeof source !== 'object') return []

  const preferredOrder = ['Clarity', 'Relevance', 'Structure', 'Confidence', 'Depth']
  const keys = Object.keys(source)
  const ordered = [
    ...preferredOrder.filter((label) => keys.includes(label) || keys.includes(label.toLowerCase())),
    ...keys.filter(
      (key) => !preferredOrder.some((label) => label.toLowerCase() === key.toLowerCase()),
    ),
  ]

  return ordered
    .map((key) => {
      const raw = source[key] ?? source[key.toLowerCase()]
      if (raw == null) return null
      if (typeof raw === 'number') return { label: key, score: raw, comment: '' }
      if (typeof raw === 'object') {
        return {
          label: key,
          score: raw.score ?? raw.value ?? raw.rating ?? '-',
          comment: raw.comment ?? raw.notes ?? raw.feedback ?? '',
        }
      }
      return { label: key, score: '-', comment: String(raw) }
    })
    .filter(Boolean)
}

function InterviewPage() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [customTopic, setCustomTopic] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [inputMode, setInputMode] = useState('text')
  const [responseDraft, setResponseDraft] = useState('')
  const [voiceDraft, setVoiceDraft] = useState(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [feedbackPayload, setFeedbackPayload] = useState(null)
  const [view, setView] = useState('setup')
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [useDocs, setUseDocs] = useState(false)

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startedAtRef = useRef(0)

  const feedbackRows = useMemo(() => buildFeedbackRows(feedbackPayload), [feedbackPayload])

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const updateForm = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const clearVoiceDraft = () => {
    setVoiceDraft((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }

  const releaseRecorderResources = () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
  }

  useEffect(() => () => {
    clearTimer()
    releaseRecorderResources()
    if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url)
  }, [voiceDraft])

  const toggleTopic = (topic) => {
    setForm((current) => {
      const exists = current.topics.includes(topic)
      return {
        ...current,
        topics: exists
          ? current.topics.filter((item) => item !== topic)
          : [...current.topics, topic],
      }
    })
  }

  const addCustomTopic = () => {
    const normalized = normalizeTopic(customTopic)
    if (!normalized) return
    setForm((current) => {
      if (current.topics.some((topic) => topic.toLowerCase() === normalized.toLowerCase())) {
        return current
      }
      return { ...current, topics: [...current.topics, normalized] }
    })
    setCustomTopic('')
  }

  const validateSetup = () => {
    if (useDocs) {
      const storedUserId = localStorage.getItem('authUserId');
      let docs = [];
      if (storedUserId) {
        try { docs = JSON.parse(localStorage.getItem(`docs_${storedUserId}`) || '[]'); } catch (e) {}
      }
      const resume = docs.find(d => d.type === 'Resume');
      const jobDesc = docs.find(d => d.type === 'Job Requirements');
      if (!resume || !jobDesc) {
        return 'Please upload both a Resume and Job Requirements in the Dashboard first.'
      }
      if (!resume.content || !jobDesc.content) {
        return 'One or more documents have no text content. Please re-upload your files in the Dashboard to enable automatic reading.'
      }
    } else {
      if (!form.jobDescription.trim()) return 'Please add a job description before starting.'
      if (!form.background.trim()) return 'Please add your professional background before starting.'
    }
    if (!form.topics.length) return 'Please select at least one interview topic.'
    return ''
  }

  const setMode = (nextMode) => {
    if (!nextMode || nextMode === inputMode) return
    if (isRecording && mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (nextMode === 'text') clearVoiceDraft()
    if (nextMode === 'voice') setResponseDraft('')
    setInputMode(nextMode)
  }

  const handleStartSession = async () => {
    const validationError = validateSetup()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setIsStarting(true)

    try {
      const storedUserId = localStorage.getItem('authUserId');
      let docs = [];
      if (storedUserId) {
        try { docs = JSON.parse(localStorage.getItem(`docs_${storedUserId}`) || '[]'); } catch (e) {}
      }
      const resumeDoc = docs.find(d => d.type === 'Resume');
      const jobDescDoc = docs.find(d => d.type === 'Job Requirements');

      const payload = await startInterviewSession({
        jobDescription: useDocs ? (jobDescDoc?.content || '') : form.jobDescription,
        background: useDocs ? (resumeDoc?.content || '') : form.background,
        topics: form.topics,
        hasResume: useDocs ? !!resumeDoc : !!form.background.trim(),
        hasJobDesc: useDocs ? !!jobDescDoc : !!form.jobDescription.trim(),
        userId,
      })

      const nextSessionId = extractSessionId(payload)
      const openingQuestion = extractInterviewerText(payload)

      setSessionId(nextSessionId)
      setMessages(
        openingQuestion
          ? [{ role: 'interviewer', text: openingQuestion, source: 'text' }]
          : [],
      )
      setFeedbackPayload(null)
      setInputMode('text')
      setResponseDraft('')
      clearVoiceDraft()
      setView('interview')
    } catch (caughtError) {
      setError(caughtError.message || 'Could not start interview session.')
    } finally {
      setIsStarting(false)
    }
  }

  const submitTurn = async (sendRequest, candidateText, source) => {
    setError('')
    setIsResponding(true)

    try {
      const payload = await sendRequest()
      const interviewerReply = extractInterviewerText(payload)

      setMessages((current) => {
        const next = [...current, { role: 'candidate', text: candidateText, source }]
        if (interviewerReply) next.push({ role: 'interviewer', text: interviewerReply, source: 'text' })
        return next
      })

      return payload
    } catch (caughtError) {
      setError(caughtError.message || 'Could not submit your response.')
      throw caughtError
    } finally {
      setIsResponding(false)
    }
  }

  const handleSendTextResponse = async () => {
    if (!sessionId) {
      setError('Missing session id. Start a new interview.')
      return
    }

    const message = responseDraft.trim()
    if (!message) return

    await submitTurn(() => respondInterviewSession({ sessionId, response: message }), message, 'text')
    setResponseDraft('')
  }

  const startRecording = async () => {
    if (isResponding || isEnding || !sessionId || isRecording) return
    if (typeof window === 'undefined' || !window.MediaRecorder) return setError('This browser does not support audio recording.')

    try {
      setError('')
      if (inputMode !== 'voice') setInputMode('voice')
      setResponseDraft('')
      clearVoiceDraft()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const selectedType = preferredTypes.find((mime) => MediaRecorder.isTypeSupported(mime))
      const recorder = selectedType ? new MediaRecorder(stream, { mimeType: selectedType }) : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        clearTimer()
        setIsRecording(false)

        const duration = Math.max(1, Math.min(MAX_RECORD_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000)))
        setRecordingSeconds(duration)

        const chunkType = chunksRef.current[0]?.type
        const mimeType = chunkType || recorder.mimeType || selectedType || 'audio/webm'

        const blob = new Blob(chunksRef.current, { type: mimeType })
        if (blob.size > 0) setVoiceDraft({ blob, url: URL.createObjectURL(blob), duration, mimeType })

        releaseRecorderResources()
      }

      recorder.onerror = () => {
        setError('Audio recording failed. Please try again.')
        clearTimer()
        setIsRecording(false)
        releaseRecorderResources()
      }

      startedAtRef.current = Date.now()
      setRecordingSeconds(0)
      setIsRecording(true)

      recorder.start(250)

      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setRecordingSeconds(Math.min(MAX_RECORD_SECONDS, elapsed))

        if (elapsed >= MAX_RECORD_SECONDS && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 200)

    } catch {
      setIsRecording(false)
      clearTimer()
      releaseRecorderResources()
      setError('Microphone permission was blocked or unavailable.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
      return
    }
    startRecording()
  }

  const handleSendVoiceResponse = async () => {
    if (!sessionId) return setError('Missing session id. Start a new interview.')
    if (!voiceDraft?.blob) return setError('Record and review audio before sending.')

    const extension = voiceDraft.mimeType?.includes('mp4') ? 'm4a' : 'webm'
    const payload = await submitTurn(
      () => respondInterviewSessionAudio({ sessionId, audioBlob: voiceDraft.blob, filename: `response-${Date.now()}.${extension}` }),
      'Voice response submitted.',
      'voice'
    )

    const transcript = extractTranscriptText(payload)
    if (transcript) {
      setMessages((current) => {
        const next = [...current]
        const idx = next.map((message) => message.role).lastIndexOf('candidate')
        if (idx >= 0) next[idx] = { ...next[idx], text: transcript }
        return next
      })
    }

    clearVoiceDraft()
    setRecordingSeconds(0)
  }

  const handleEndSession = async () => {
    if (!sessionId) return

    setError('')
    setIsEnding(true)

    try {
      const payload = await endInterviewSession({ sessionId })
      setFeedbackPayload(payload)
      setView('feedback')
    } catch (caughtError) {
      setError(caughtError.message || 'Could not end interview session.')
    } finally {
      setIsEnding(false)
    }
  }

  const handleReset = () => {
    clearTimer()
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    releaseRecorderResources()

    setForm(INITIAL_FORM)
    setCustomTopic('')
    setSessionId('')
    setInputMode('text')
    setResponseDraft('')
    clearVoiceDraft()
    setRecordingSeconds(0)
    setIsRecording(false)
    setMessages([])
    setFeedbackPayload(null)
    setError('')
    setView('setup')
  }

  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          background:
            'radial-gradient(circle at 15% 20%, rgba(15,76,129,0.2), transparent 40%), radial-gradient(circle at 85% 10%, rgba(31,122,140,0.2), transparent 45%), #eef3f8',
        }}
      >
        <AppBar position="static" elevation={0} color="transparent">
          <Toolbar sx={{ borderBottom: '1px solid rgba(15,76,129,0.12)' }}>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              Confidence, Engineered
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
              <Button color="secondary" variant="outlined" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
              <Button color="primary" startIcon={<RestartAltRoundedIcon />} onClick={handleReset}>
                New Setup
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
          <Grid container spacing={3} alignItems="stretch">
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, border: '1px solid #d4e1ef', height: '100%' }}>
                <Typography variant="overline" color="primary.main" sx={{ letterSpacing: '0.08em' }}>
                  Interview Coach
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.1, mt: 1, mb: 2 }}>
                  Practice with a polished, realistic interview flow.
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  Start in demo mode using your live Flask routes via `/api`. Voice now supports strict push-to-talk with review before send.
                </Typography>
                <Stack spacing={1.5}>
                  {[
                    'Corporate-grade setup experience',
                    'Real-time interview transcript',
                    'Structured feedback-ready session end',
                  ].map((line) => (
                    <Stack key={line} direction="row" spacing={1.2} alignItems="center">
                      <CheckCircleRoundedIcon color="secondary" fontSize="small" />
                      <Typography variant="body2">{line}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, border: '1px solid #d4e1ef' }}>
                {view === 'setup' && (
                  <Stack spacing={2.5}>
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                      <Typography variant="h5">New Interview Setup</Typography>
                      <ToggleButtonGroup
                        color="primary"
                        value={useDocs ? 'docs' : 'manual'}
                        exclusive
                        onChange={(e, val) => { if (val !== null) setUseDocs(val === 'docs'); }}
                        size="small"
                      >
                        <ToggleButton value="manual">Manual Entry</ToggleButton>
                        <ToggleButton value="docs">Read from Documents</ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>
                    
                    {!useDocs ? (
                      <>
                        <TextField
                          label="Job Description"
                          value={form.jobDescription}
                          onChange={updateForm('jobDescription')}
                          multiline
                          minRows={4}
                          fullWidth
                        />
                        <TextField
                          label="Your Background"
                          value={form.background}
                          onChange={updateForm('background')}
                          multiline
                          minRows={3}
                          fullWidth
                        />
                      </>
                    ) : (
                      <Stack spacing={2}>
                        <Alert severity="info">
                          AI will use documents from your Dashboard. Make sure you have one marked as <strong>Resume</strong> and one as <strong>Job Requirements</strong>.
                        </Alert>
                        {(() => {
                          const storedUserId = localStorage.getItem('authUserId');
                          let docs = [];
                          if (storedUserId) {
                            try { docs = JSON.parse(localStorage.getItem(`docs_${storedUserId}`) || '[]'); } catch (e) {}
                          }
                          const resume = docs.find(d => d.type === 'Resume');
                          const jobDesc = docs.find(d => d.type === 'Job Requirements');
                          
                          return (
                            <Stack spacing={1}>
                              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                                <Typography variant="caption" color="text.secondary" display="block">Target Resume:</Typography>
                                <Typography variant="body2" fontWeight="bold">
                                  {resume ? `${resume.title} (${resume.content ? 'Content Ready' : 'No text content'})` : 'None found - Please upload in Dashboard'}
                                </Typography>
                              </Paper>
                              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                                <Typography variant="caption" color="text.secondary" display="block">Target Job Requirements:</Typography>
                                <Typography variant="body2" fontWeight="bold">
                                  {jobDesc ? `${jobDesc.title} (${jobDesc.content ? 'Content Ready' : 'No text content'})` : 'None found - Please upload in Dashboard'}
                                </Typography>
                              </Paper>
                            </Stack>
                          );
                        })()}
                      </Stack>
                    )}

                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Behavioral Topics
                      </Typography>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {SUGGESTED_TOPICS.map((topic) => {
                          const active = form.topics.includes(topic)
                          return (
                            <Chip
                              key={topic}
                              label={topic}
                              color={active ? 'primary' : 'default'}
                              variant={active ? 'filled' : 'outlined'}
                              onClick={() => toggleTopic(topic)}
                            />
                          )
                        })}
                        {form.topics
                          .filter((topic) => !SUGGESTED_TOPICS.includes(topic))
                          .map((topic) => (
                            <Chip
                              key={topic}
                              label={topic}
                              color="primary"
                              variant="filled"
                              onDelete={() => toggleTopic(topic)}
                            />
                          ))}
                      </Stack>
                    </Box>

                    <TextField
                      label="Add Custom Topic"
                      value={customTopic}
                      onChange={(event) => setCustomTopic(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addCustomTopic()
                        }
                      }}
                      fullWidth
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={addCustomTopic} edge="end" color="primary">
                                <AddRoundedIcon />
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <Button
                      size="large"
                      variant="contained"
                      startIcon={isStarting ? <CircularProgress size={18} color="inherit" /> : <PlayArrowRoundedIcon />}
                      disabled={isStarting}
                      onClick={handleStartSession}
                    >
                      {isStarting ? 'Starting session...' : 'Start Interview Session'}
                    </Button>
                  </Stack>
                )}

                {view === 'interview' && (
                  <Stack spacing={2.5}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                      <Box>
                        <Typography variant="h5">Interview Session Live</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Session: {sessionId || 'Pending id from backend'}
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        color="secondary"
                        onClick={handleEndSession}
                        disabled={isEnding || isResponding || isRecording}
                        startIcon={isEnding ? <CircularProgress size={18} color="inherit" /> : <CheckCircleRoundedIcon />}
                      >
                        {isEnding ? 'Ending...' : 'End and Get Feedback'}
                      </Button>
                    </Stack>

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        maxHeight: 340,
                        overflowY: 'auto',
                        backgroundColor: '#f9fbfe',
                      }}
                    >
                      <Stack spacing={1.5}>
                        {messages.length === 0 && (
                          <Typography variant="body2" color="text.secondary">
                            Waiting for interviewer prompt...
                          </Typography>
                        )}
                        {messages.map((message, index) => (
                          <Card
                            key={`${message.role}-${index}`}
                            variant="outlined"
                            sx={{
                              borderColor:
                                message.role === 'interviewer' ? 'rgba(15,76,129,0.3)' : 'rgba(31,122,140,0.3)',
                              alignSelf: message.role === 'interviewer' ? 'flex-start' : 'flex-end',
                              maxWidth: '92%',
                              backgroundColor: message.role === 'interviewer' ? '#edf4fb' : '#eaf7f9',
                            }}
                          >
                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">
                                {message.role === 'interviewer' ? 'AI Interviewer' : message.source === 'voice' ? 'You (Voice)' : 'You'}
                              </Typography>
                              <Typography variant="body2">{message.text}</Typography>
                            </CardContent>
                          </Card>
                        ))}
                      </Stack>
                    </Paper>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Input Mode
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={inputMode}
                        onChange={(_, value) => setMode(value)}
                        disabled={isResponding || isRecording}
                      >
                        <ToggleButton value="text">Text</ToggleButton>
                        <ToggleButton value="voice">Voice</ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>

                    {inputMode === 'text' && (
                      <Stack spacing={1.5}>
                        <TextField
                          label="Your Response (Text Input)"
                          value={responseDraft}
                          onChange={(event) => setResponseDraft(event.target.value)}
                          multiline
                          minRows={3}
                          fullWidth
                          disabled={isResponding}
                        />

                        <Button
                          variant="contained"
                          onClick={handleSendTextResponse}
                          disabled={isResponding || !responseDraft.trim()}
                          startIcon={isResponding ? <CircularProgress size={18} color="inherit" /> : <SendRoundedIcon />}
                        >
                          {isResponding ? 'Submitting...' : 'Send Text Response'}
                        </Button>
                      </Stack>
                    )}

                    {inputMode === 'voice' && (
                      <Stack spacing={1.5}>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                          <Stack spacing={1}>
                            <Button
                              variant={isRecording ? 'contained' : 'outlined'}
                              color={isRecording ? 'secondary' : 'primary'}
                              size="large"
                              startIcon={<MicRoundedIcon />}
                              onClick={toggleRecording}
                              disabled={isResponding || isEnding}
                              sx={{ alignSelf: 'flex-start' }}
                            >
                              {isRecording ? 'Stop Recording' : 'Start Recording'}
                            </Button>
                            <Typography variant="body2" color="text.secondary">
                              {isRecording
                                ? `Recording ${formatDuration(recordingSeconds)} / ${formatDuration(MAX_RECORD_SECONDS)}`
                                : 'Click the mic to start, click again to stop and review.'}
                            </Typography>
                            {isRecording && (
                              <LinearProgress
                                variant="determinate"
                                value={(Math.min(recordingSeconds, MAX_RECORD_SECONDS) / MAX_RECORD_SECONDS) * 100}
                              />
                            )}
                          </Stack>
                        </Paper>

                        {voiceDraft && (
                          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, backgroundColor: '#f7fbff' }}>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">
                                Review Recording ({formatDuration(voiceDraft.duration)})
                              </Typography>
                              <audio controls preload="metadata" style={{ width: '100%' }}>
                                <source src={voiceDraft.url} type={voiceDraft.mimeType} />
                                Your browser could not play this recording.
                              </audio>
                              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <Button
                                  variant="contained"
                                  onClick={handleSendVoiceResponse}
                                  disabled={isResponding}
                                  startIcon={
                                    isResponding ? <CircularProgress size={18} color="inherit" /> : <SendRoundedIcon />
                                  }
                                >
                                  {isResponding ? 'Uploading...' : 'Send Voice Response'}
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="inherit"
                                  onClick={() => {
                                    clearVoiceDraft()
                                    setRecordingSeconds(0)
                                  }}
                                  startIcon={<DeleteOutlineRoundedIcon />}
                                  disabled={isResponding}
                                >
                                  Discard
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        )}
                      </Stack>
                    )}
                  </Stack>
                )}

                {view === 'feedback' && (
                  <Stack spacing={2}>
                    <Typography variant="h5">Session Feedback</Typography>
                    <Typography color="text.secondary">
                      Results from `/api/session/end` are shown below.
                    </Typography>
                    <Divider />

                    {feedbackRows.length > 0 ? (
                      <Grid container spacing={1.5}>
                        {feedbackRows.map((row) => (
                          <Grid key={row.label} size={{ xs: 12, sm: 6 }}>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
                              <Typography variant="subtitle2" color="primary.main">
                                {row.label}
                              </Typography>
                              <Typography variant="h5" sx={{ my: 0.5 }}>
                                {row.score}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {row.comment || 'No commentary returned.'}
                              </Typography>
                            </Paper>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Alert severity="info">Feedback returned, but no score dimensions were found in the payload.</Alert>
                    )}

                    <Stack direction="row" spacing={1.5}>
                      <Button variant="contained" onClick={() => setView('interview')}>
                        Back to Session
                      </Button>
                      <Button variant="outlined" onClick={handleReset}>
                        Start a New Interview
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>

          {error && (
            <Alert sx={{ mt: 3 }} severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
        </Container>
      </Box>
    </>
  )
}

export default function App() {
  const { isAuthenticated } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/interview" 
        element={isAuthenticated ? <InterviewPage /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="*" 
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} 
      />
    </Routes>
  );
}
