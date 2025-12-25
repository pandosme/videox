import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

// Pages (to be implemented)
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LiveView from './pages/LiveView';
import Recordings from './pages/Recordings';
import Cameras from './pages/Cameras';
import Storage from './pages/Storage';
import Events from './pages/Events';
import Settings from './pages/Settings';
import Layout from './components/layout/Layout';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="live" element={<LiveView />} />
              <Route path="recordings" element={<Recordings />} />
              <Route path="cameras" element={<Cameras />} />
              <Route path="storage" element={<Storage />} />
              <Route path="events" element={<Events />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
