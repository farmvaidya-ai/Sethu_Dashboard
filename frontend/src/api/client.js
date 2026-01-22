import axios from 'axios';

// Create axios instance with base URL from environment variable
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000'
});

export default apiClient;
