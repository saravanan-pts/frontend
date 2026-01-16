import axios from 'axios';

// FIX: Changed to Port 8000 and standardized the Env Variable
// @ts-ignore
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response Interceptor for global error logging
apiClient.interceptors.response.use(
  (response) => response,
  (error: any) => {
    // FIX: Safer error message extraction
    const errorMsg = error.response?.data?.detail || error.message || "Unknown API Error";
    console.error("API Error:", errorMsg);
    return Promise.reject(error);
  }
);

export default apiClient;