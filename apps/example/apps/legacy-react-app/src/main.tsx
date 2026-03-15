import React from 'react'
import ReactDOM from 'react-dom'

import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Expected a #root element for the legacy React example app')
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  rootElement
)
