import { BrowserRouter, useInRouterContext } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import AppRoutes from "./routes/AppRoutes";
import "./App.css";

function AppContent() {
  const inRouter = useInRouterContext();
  const content = (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );

  if (!inRouter) {
    return <BrowserRouter>{content}</BrowserRouter>;
  }

  return content;
}

export default function App() {
  return <AppContent />;
}
