import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const branchId = localStorage.getItem("activeBranchId");
  if (branchId) {
    config.headers["x-branch-id"] = branchId;
  }
  return config;
});
