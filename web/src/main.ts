import { createApp } from "vue";
import App from "./App.vue";
import { startLook } from "./lib/look";
import { loadSession } from "./lib/session";
import "./styles.css";

startLook();
createApp(App).mount("#app");
loadSession();
