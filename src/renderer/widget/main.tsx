import React from 'react'
import ReactDOM from 'react-dom/client'
import WidgetApp from './WidgetApp.js'
import './global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
)
