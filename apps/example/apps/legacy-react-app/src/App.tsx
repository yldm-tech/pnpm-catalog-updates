import axios from 'axios'
import { debounce } from 'lodash'
import React from 'react'

type RepositorySummary = {
  full_name: string
  html_url: string
  open_issues_count: number
  stargazers_count: number
}

function App() {
  const [count, setCount] = React.useState(0)
  const [repository, setRepository] = React.useState<RepositorySummary | null>(null)

  const debouncedIncrement = React.useMemo(
    () => debounce(() => setCount((value) => value + 1), 200),
    []
  )

  React.useEffect(() => {
    return () => {
      debouncedIncrement.cancel()
    }
  }, [debouncedIncrement])

  React.useEffect(() => {
    let active = true

    void axios
      .get<RepositorySummary>('https://api.github.com/repos/yldm-tech/pnpm-catalog-updates')
      .then(({ data }) => {
        if (active) {
          setRepository(data)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load repository data for the legacy example app:', error)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div
      style={{
        fontFamily: 'system-ui',
        lineHeight: 1.5,
        margin: '0 auto',
        maxWidth: 720,
        padding: '2rem',
      }}
    >
      <h1>Legacy React 17 Example</h1>
      <p>This app stays on the React 17 catalog while sharing the same workspace-level tooling.</p>

      <button onClick={debouncedIncrement} style={{ cursor: 'pointer', padding: '0.6rem 1rem' }}>
        Increment count
      </button>
      <p>Current count: {count}</p>

      <section
        style={{ background: '#f6f8fa', borderRadius: 12, marginTop: '1.5rem', padding: '1rem' }}
      >
        <h2>Repository Snapshot</h2>
        {repository ? (
          <ul>
            <li>{repository.full_name}</li>
            <li>Stars: {repository.stargazers_count}</li>
            <li>Open issues: {repository.open_issues_count}</li>
            <li>
              <a href={repository.html_url}>View repository</a>
            </li>
          </ul>
        ) : (
          <p>Loading repository metadata...</p>
        )}
      </section>
    </div>
  )
}

export default App
