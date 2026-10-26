import { BrowserRouter, useInRouterContext } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import AppRoutes from "./routes/AppRoutes";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

function AppContent() {
  const inRouter = useInRouterContext();
  const content = (
    <ErrorBoundary>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </ErrorBoundary>
  );

  if (!inRouter) {
    return <BrowserRouter>{content}</BrowserRouter>;
  }

  return content;
}

export default function App() {
  return <AppContent />;
}
