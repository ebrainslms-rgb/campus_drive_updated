/**
 * main.jsx – Application entry point
 * Mounts the React tree into #root and imports global styles.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { AdminProvider } from './context/AdminContext'
import { StudentAuthProvider } from './context/StudentAuthContext'
import { ThemeProvider } from './context/ThemeContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AdminProvider>
          <StudentAuthProvider>
            <App />
          </StudentAuthProvider>
        </AdminProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
