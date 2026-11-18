/* Вход в админку: почта и пароль администратора сайта.

   Учётки те же, что у старой админки (/admin-old), и сессия у них одна.
   Экран показывается до оболочки, когда движок на месте, а сессии нет
   (js/boot.js). Вошли — перезагрузка: данные сайта, права и токен формы
   приходят обычной загрузкой.

   Это страница, а не модалка поверх админки: под окном ничего нет, и
   затемнение кита ему не нужно. Окно — анатомия окна кита (.ui-modal:
   шапка, тело, подвал) на сером холсте, без рамки, с короткой тенью. Поля и кнопки
   серые (--secondary), всё крупное (--lg): форма из
   двух полей, других дел на экране нет. В шапке по центру — знак и «Корзилла CMS»;
   внизу — ссылка на политику обработки данных. */

import { t } from "../core/i18n.js";
import { html } from "../ui/html.js";
import { loadKit, mount, toast, isDark } from "../ui/kit.js";
import { setLook } from "../ui/look.js";
import { login } from "../data/api.js";
import { brandMark } from "./logo.js";
import { icon } from "../ui/icons.js";

/* Вход через сервисы — пока только кнопки: обработчиков в движке для админки
   нет, нажатие говорит об этом тостом. Знаки — глифы кита (eokit/core/glyphs.js). */
const PROVIDERS = [["vk", "ВКонтакте"], ["yandex", "Яндекс"], ["telegram", "Telegram"]];
/* Согласия на входе нет и не нужно. Учётки админов заводит владелец сайта,
   и данные сотрудника обрабатываются ради договора и работы (152-ФЗ, ст. 6,
   ч. 1, п. 5), а не по согласию. Прежняя фраза «нажимая кнопку, я принимаю
   соглашение и даю согласие» с 1 сентября 2025 года согласием не считается
   вовсе: оно оформляется отдельно. Под окном — уведомление со ссылками
   на политику обработки данных (её оператор обязан опубликовать, ст. 18.1)
   и политику cookie: вход держится на куке сессии. Это ознакомление,
   а не согласие. Адреса — страницы «Политики и документы» (docs.js, slug). */
const doc = (href, text) => html`<a class="ui-link" href="${href}" target="_blank" rel="noopener">${t(text)}</a>`;

/* Не резолвится: вход перезагружает страницу. */
export async function loginScreen() {
  await loadKit(["masks"]);
  document.getElementById("app").hidden = true;

  const root = document.createElement("main");
  root.className = "login";
  root.innerHTML = String(html`<form class="ui-modal" novalidate aria-label="${t("Sign in to the admin")}">
    <div class="ui-modal__header">
      <div class="login__brand">${brandMark()}<span>${t("Korzilla CMS")}</span></div>
    </div>
    <div class="ui-modal__body ui-field-group">
      <div class="ui-field">
        <label class="ui-field__label" for="login-email">${t("Email")}</label>
        <div class="ui-input__wrap">${icon("mail")}<input class="ui-input ui-input--secondary ui-input--lg" id="login-email" name="email" placeholder="${t("Sign-in email")}" type="email" inputmode="email" autocomplete="username" autofocus></div>
      </div>
      <div class="ui-field">
        <label class="ui-field__label" for="login-password">${t("Password")}</label>
        <div class="ui-input__wrap">${icon("lock")}<input class="ui-input ui-input--secondary ui-input--lg" id="login-password" name="password" placeholder="${t("Sign-in password")}" type="password" autocomplete="current-password" data-ui-mask="password"></div>
        <p class="ui-hint ui-hint--destructive" data-login-error hidden></p>
      </div>
    </div>
    <div class="ui-modal__footer">
      <button class="ui-btn ui-btn--secondary ui-btn--lg ui-btn--block" type="submit"><span class="ui-btn__label">${t("Sign in")}</span></button>
      <p class="login__or">${t("or")}</p>
      <div class="login__alt">${PROVIDERS.map(([id, name]) => html`<button class="ui-btn ui-btn--secondary ui-btn--lg" type="button" data-login-provider="${name}" aria-label="${t("Sign in with")} ${name}" data-ui-tooltip="${name}" data-side="bottom"><span class="ui-icon" data-ui-icon="${id}"></span></button>`)}</div>
    </div>
  </form>
  <p class="login__docs ui-text-caption ui-text-muted">${t("Signing in, you confirm that you have read the")} ${doc("/privacy/", "Personal data policy")} ${t("and the")} ${doc("/cookies/", "Cookie policy")}</p>`);
  /* Тема — сразу, до входа: кнопка под ссылкой на политику, посередине до низа страницы, выбор сохраняется
     тем же setLook, что и меню аккаунта, и переживает вход. */
  const themeButton = () => {
    const dark = isDark();
    const label = dark ? t("Light mode") : t("Dark mode");
    return html`<button class="ui-btn ui-btn--ghost ui-btn--icon ui-btn--lg login__theme" type="button" aria-label="${label}" data-ui-tooltip="${label}" data-side="top">${icon(dark ? "sun" : "moon")}</button>`;
  };
  root.insertAdjacentHTML("beforeend", String(themeButton()));
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".login__theme");
    if (!button) return;
    setLook({ theme: isDark() ? "light" : "dark" });
    button.outerHTML = String(themeButton());
    mount(root.querySelector(".login__theme"));
  });
  document.body.append(root);
  mount(root);

  const form = root.querySelector("form");
  const error = form.querySelector("[data-login-error]");
  const inputs = [...form.querySelectorAll("input")];
  const button = form.querySelector("[type=submit]");

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
    for (const input of inputs) input.setAttribute("aria-invalid", "true");
  };

  form.addEventListener("input", () => {
    error.hidden = true;
    for (const input of inputs) input.removeAttribute("aria-invalid");
  });

  form.querySelector(".login__alt").addEventListener("click", (event) => {
    const provider = event.target.closest("[data-login-provider]");
    if (provider) toast(`${t("Sign in with")} ${provider.dataset.loginProvider} — ${t("coming soon")}`, { type: "neutral" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return fail(t("Enter your email and password"));
    button.disabled = true;
    try {
      await login(email, password);
      location.reload();
    } catch (failure) {
      button.disabled = false;
      fail(failure.status ? failure.first : t("No connection to the server. Try again."));
    }
  });

  return new Promise(() => {});
}
