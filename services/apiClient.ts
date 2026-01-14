import axios from 'axios';

// @ts-ignore (This suppresses the error if 'process' is not found in the root folder)
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: Add simple error logging
apiClient.interceptors.response.use(
  (response) => response,
  (error: any) => { // Using 'any' here prevents strict type errors
    const errorMsg = error.response?.data || error.message || "Unknown API Error";
    console.error("API Error:", errorMsg);
    return Promise.reject(error);
  }
);

export default apiClient;