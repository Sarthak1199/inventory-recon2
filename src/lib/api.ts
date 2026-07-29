import axios from "axios";

const apiBase = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const branchId = localStorage.getItem("activeBranchId");
  if (branchId) {
    config.headers["x-branch-id"] = branchId;
  }
  return config;
});
