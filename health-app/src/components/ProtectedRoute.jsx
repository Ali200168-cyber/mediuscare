import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ roles = [], children }) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (roles.length && !roles.includes(role)) return <Navigate to="/login" replace />;
  return children;
};

export default ProtectedRoute;
