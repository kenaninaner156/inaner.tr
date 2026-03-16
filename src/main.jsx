import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CompanyProvider } from './context/CompanyContext.jsx'
import { TruckProvider } from './context/TruckContext.jsx'
import { DataProvider } from './context/DataContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CompanyProvider>
      <TruckProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </TruckProvider>
    </CompanyProvider>
  </StrictMode>,
)
