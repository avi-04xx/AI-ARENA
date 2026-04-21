import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type CompanyRule = {
  id: string
  name: string
  preferredKeywords: string[]
  bannedKeywords: string[]
}

const COMPANY_RULES: CompanyRule[] = [
  {
    id: 'google',
    name: 'Google',
    preferredKeywords: ['scale', 'impact', 'performance', 'metrics'],
    bannedKeywords: ['table', 'image-only'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    preferredKeywords: ['ownership', 'leadership', 'customer', 'metrics'],
    bannedKeywords: ['columns', 'graphic'],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    preferredKeywords: ['collaboration', 'cloud', 'security', 'results'],
    bannedKeywords: ['table', 'header-footer'],
  },
  {
    id: 'custom',
    name: 'Custom Company',
    preferredKeywords: ['skills', 'project', 'experience', 'results'],
    bannedKeywords: ['table'],
  },
]

function cleanWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  const pageTexts: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    pageTexts.push(text)
  }

  return pageTexts.join('\n').trim()
}

function scoreResume(text: string, jobDescription: string, company: CompanyRule): number {
  if (!text.trim()) return 0

  const resumeWords = cleanWords(text)
  const uniqueResumeWords = new Set(resumeWords)
  const descriptionWords = cleanWords(jobDescription)
  const wordsUsedForMatch = new Set([...uniqueResumeWords, ...descriptionWords])
  const bannedMatches = company.bannedKeywords.filter((word) => text.toLowerCase().includes(word)).length

  const penaltyScore = bannedMatches * 10
  const lengthBonus = resumeWords.length > 120 ? 20 : (resumeWords.length / 120) * 20
  const descriptionMatchCount = descriptionWords.filter((word) => uniqueResumeWords.has(word)).length
  const descriptionScore = descriptionWords.length
    ? Math.min(20, (descriptionMatchCount / descriptionWords.length) * 20)
    : 0

  const blendedPreferredScore =
    (company.preferredKeywords.filter((word) => wordsUsedForMatch.has(word)).length /
      company.preferredKeywords.length) *
    60
  const total = Math.max(
    0,
    Math.min(100, Math.round(blendedPreferredScore + lengthBonus + descriptionScore - penaltyScore)),
  )
  return total
}

function getStageLabels(score: number): string[] {
  if (score === 0) return ['Upload Resume', 'Select Company', 'Run ATS']
  if (score < 50) return ['Extract Sections', 'Keyword Scan', 'Rule Check']
  if (score < 80) return ['Extract Sections', 'Keyword Scan', 'Good Match']
  return ['Extract Sections', 'Strong Match', 'Pass Prediction']
}

function App() {
  const [selectedCompanyId, setSelectedCompanyId] = useState('google')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [fileName, setFileName] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [hasCalculated, setHasCalculated] = useState(false)
  const [message, setMessage] = useState('Upload resume + add job description, then click Calculate ATS Score.')

  const selectedCompany = useMemo(
    () => COMPANY_RULES.find((company) => company.id === selectedCompanyId) ?? COMPANY_RULES[0],
    [selectedCompanyId],
  )

  const stageLabels = useMemo(() => getStageLabels(score ?? 0), [score])

  const matchedKeywords = useMemo(() => {
    const lowerText = `${resumeText} ${jobDescription}`.toLowerCase()
    return selectedCompany.preferredKeywords.filter((word) => lowerText.includes(word))
  }, [resumeText, jobDescription, selectedCompany])

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      const reader = new FileReader()
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : ''
        setResumeText(content)
      }
      reader.readAsText(file)
      setMessage('Text resume loaded. Add job description, then click Calculate ATS Score.')
      return
    }

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        setMessage('Reading PDF... please wait.')
        const extractedText = await extractTextFromPdf(file)

        if (!extractedText) {
          setResumeText('')
          setMessage('Could not extract text from this PDF. Please paste resume text manually.')
          return
        }

        setResumeText(extractedText)
        setMessage('PDF text extracted. Now click Calculate ATS Score.')
      } catch {
        setResumeText('')
        setMessage('PDF read failed. Please paste resume text manually.')
      }
      return
    }

    setResumeText('')
    setMessage('Unsupported file type. Please upload .txt or .pdf.')
  }

  function handleCalculateScore() {
    if (!resumeText.trim()) {
      setHasCalculated(true)
      setScore(0)
      setMessage('Please paste resume text first.')
      return
    }

    if (!jobDescription.trim()) {
      setHasCalculated(true)
      setScore(0)
      setMessage('Please paste job description first.')
      return
    }

    const nextScore = scoreResume(resumeText, jobDescription, selectedCompany)
    setScore(nextScore)
    setHasCalculated(true)
    setMessage('Score calculated successfully.')
  }

  return (
    <div className="page">
      <header className="header">
        <h1>ATS Arena</h1>
        <p>Beginner-friendly ATS simulator built in pure React.</p>
      </header>
      <section className="guideCard">
        <h3>How to use</h3>
        <p>Step 1: Upload resume (PDF/TXT). Step 2: Paste job description. Step 3: Select company. Step 4: Click Calculate ATS Score.</p>
        <div className="tipRow">
          <span className="tipChip">Tip: Add numbers (%, KPI, revenue)</span>
          <span className="tipChip">Tip: Use action verbs</span>
        </div>
      </section>

      <main className="layout">
        <section className="card">
          <h2>1) Resume Input</h2>
          <label className="label" htmlFor="resume-file">
            Upload resume (.txt or .pdf)
          </label>
          <input id="resume-file" type="file" accept=".txt,.pdf" onChange={handleFileUpload} />
          {fileName ? <p className="helpText">Loaded file: {fileName}</p> : null}

          <label className="label" htmlFor="resume-editor">
            Or paste/edit your resume text
          </label>
          <textarea
            id="resume-editor"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste your resume text here. Try adding words like metrics, leadership, impact."
            rows={12}
          />
        </section>

        <section className="card">
          <h2>2) Company Battle Setup</h2>
          <label className="label" htmlFor="company-select">
            Choose company
          </label>
          <select
            id="company-select"
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
          >
            {COMPANY_RULES.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          <label className="label" htmlFor="job-description">
            Paste job description
          </label>
          <textarea
            id="job-description"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Paste the role description here."
            rows={7}
          />

          <button className="primaryButton" onClick={handleCalculateScore} type="button">
            Calculate ATS Score
          </button>
          <p className="helpText">{message}</p>

          <div className="scoreBox">
            <p className="scoreLabel">ATS Score</p>
            <p className="scoreValue">{score ?? 0}/100</p>
            <div className="scoreBarOuter">
              <div className="scoreBarInner" style={{ width: `${score ?? 0}%` }} />
            </div>
            <p className="scoreResult">
              {!hasCalculated ? 'Not calculated yet' : (score ?? 0) >= 75 ? 'Likely Pass' : 'Needs Improvement'}
            </p>
          </div>

          <h3>Matched Keywords</h3>
          <p>{matchedKeywords.length > 0 ? matchedKeywords.join(', ') : 'No strong matches yet.'}</p>
        </section>

        <section className="card">
          <h2>3) Simulation Arena</h2>
          <p className="helpText">Simple version of animated ATS flow for MVP:</p>
          <div className="flowRow">
            {stageLabels.map((stage) => (
              <div key={stage} className="flowStep">
                {stage}
              </div>
            ))}
          </div>

          <h3>Company Rules</h3>
          <p>
            <strong>Preferred:</strong> {selectedCompany.preferredKeywords.join(', ')}
          </p>
          <p>
            <strong>Banned:</strong> {selectedCompany.bannedKeywords.join(', ')}
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
