import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { Provider } from "react-redux";
import { store } from "./store";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <App />
  </Provider>
);

function revealApp() {
  document.body.classList.remove("app-loading");
}

if ("fonts" in document) {
  void document.fonts.ready.then(revealApp).catch(revealApp);
} else {
  revealApp();
}
