import { createContext, useContext, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({
    open: false,
    message: '',
    severity: 'info', // 'success', 'error', 'warning', 'info'
  });

  const showToast = (message, severity = 'info') => {
    setToast({
      open: true,
      message,
      severity,
    });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, open: false }));
  };

  const success = (message) => showToast(message, 'success');
  const error = (message) => showToast(message, 'error');
  const warning = (message) => showToast(message, 'warning');
  const info = (message) => showToast(message, 'info');

  const value = {
    showToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={hideToast}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={hideToast} severity={toast.severity} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};
