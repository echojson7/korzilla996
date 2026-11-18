/* Черновики писем покупателям голосом магазина (вкладка «Помощник»: тон и
   подпись). Сейчас — заготовки по поводу письма с данными заказа и товара; с
   сервером тот же вызов станет запросом к модели с перепиской, а места, где
   черновик показан (панель помощника, ответ в «Заявках», заказ), останутся.

     const draft = draftReply({ kind, name, order, product, rating });
     draft.text      текст для поля ответа
     draft.again()   другой вариант того же письма

   kind — повод. По заказу: payment (оплата картой не прошла), invoice (счёт не
   оплачен), confirm (заказ получен), pickup (собран и ждёт в магазине), sent
   (отправлен), done (получен — спасибо и отзыв), status (по статусу заказа:
   confirm, sent или done), address (уточнить адрес), stock (товара нет). По
   заявке: question (вопрос о товаре), pickup-question (можно ли забрать
   самому), invoice-request (просят счёт), review (ответ под отзывом на сайте),
   callback (просили перезвонить), wholesale (оптовая заявка), other.

   name — кому письмо, как в данных («Ольга Сафина»; у организации — контактное
   лицо). order — { number, total, status, invoice, delivery, track, place }:
   delivery — pickup | courier | cdek | post, track — трек-номер, place — адрес
   самовывоза. product — { name, stock, price }. У отзыва rating — 1…5 и topic —
   delivery, если жалоба на доставку; у оптовой заявки list — в письме уже есть
   список товаров с количеством. Из настроек сайта, готовыми фразами: place и
   hours — адрес и часы работы магазина, late — что сказать, если просят забрать
   позже закрытия, shipping — способы доставки со сроками. */

import { L } from "../core/i18n.js";
import { money, number } from "../ui/format.js";
import { voice } from "./assistant.js";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);

const GREET = {
  warm: [() => L("Hi {first},", "Здравствуйте, {first}!"), () => L("Hello {first},", "Добрый день, {first}!")],
  formal: [() => L("Dear {name},", "Здравствуйте, {first}."), () => L("Good afternoon, {name},", "Добрый день, {first}.")],
};
const CLOSE = {
  warm: [() => L("Have a nice day!", "Хорошего дня!"), () => L("Thank you for choosing us!", "Спасибо, что выбрали нас!")],
  formal: [() => L("Kind regards,", "С уважением,"), () => L("Sincerely,", "С уважением,")],
};

/* Тело письма: по поводу — варианты для тёплого и сдержанного тона. */
const BODY = {
  payment: {
    warm: [
      () => L("Payment for order {number} ({sum}) didn't go through: the bank didn't confirm it. You can try again with the link from the order email, it works for a day. If paying on delivery suits you better, just reply and we'll change the order.",
        "Оплата заказа {number} на {sum} не прошла: банк не подтвердил платёж. Попробовать ещё раз можно по ссылке из письма о заказе, она действует сутки. Если удобнее заплатить при получении, напишите, и мы переоформим заказ."),
      () => L("We can see that order {number} hasn't been paid yet. It happens when the bank stops a payment. Try again with the link from the order email: we're holding the order for you until tomorrow.",
        "Видим, что заказ {number} пока не оплачен. Так бывает, когда банк не пропускает платёж. Попробуйте ещё раз по ссылке из письма о заказе — мы держим заказ за вами до завтра."),
    ],
    formal: [
      () => L("Payment for order {number} of {sum} has not arrived. You can repeat it with the link in the order email. The order is reserved for you until tomorrow.",
        "Оплата заказа {number} на сумму {sum} не поступила. Повторить её можно по ссылке из письма о заказе. Заказ зарезервирован за вами до завтрашнего дня."),
    ],
  },
  invoice: {
    warm: [
      () => L("A reminder about invoice {invoice} for {sum} for order {number}. Everything is packed and set aside: we'll ship as soon as the payment arrives. If you need the invoice again or other details on it, just reply.",
        "Напоминаем про счёт {invoice} на {sum} по заказу {number}. Всё собрано и отложено — отправим, как только придёт оплата. Если счёт нужен заново или с другими реквизитами, напишите."),
      () => L("We're holding order {number} for you and waiting for payment of invoice {invoice} ({sum}). If the payment has already been made, send us the payment order and we'll check it.",
        "Держим заказ {number} за вами и ждём оплату по счёту {invoice} на {sum}. Если платёж уже ушёл, пришлите платёжное поручение — проверим."),
    ],
    formal: [
      () => L("We remind you that invoice {invoice} for {sum} for order {number} has not been paid yet. The goods are reserved; the order will be shipped once the payment is received.",
        "Напоминаем, что счёт {invoice} на сумму {sum} по заказу {number} пока не оплачен. Товар зарезервирован, заказ будет отгружен после поступления оплаты."),
    ],
  },
  confirm: {
    warm: [
      ({ delivery }) => delivery === "pickup"
        ? L("We've received order {number} for {sum} and are already packing it. We'll write as soon as you can pick it up.",
          "Мы получили заказ {number} на {sum} и уже собираем его. Напишем, как только можно будет забрать.")
        : L("We've received order {number} for {sum} and are already packing it. We'll write as soon as it's handed to delivery.",
          "Мы получили заказ {number} на {sum} и уже собираем его. Напишем, как только передадим в доставку."),
    ],
    formal: [
      () => L("Order {number} for {sum} has been received and is being processed. We will notify you when it is ready.",
        "Заказ {number} на сумму {sum} принят в работу. Мы сообщим, когда он будет готов."),
    ],
  },
  pickup: {
    warm: [
      () => L("Order {number} is packed and waiting for you at our shop: {place}. Just tell us the order number at the counter.",
        "Заказ {number} собран и ждёт вас в магазине: {place}. На кассе достаточно назвать номер заказа."),
      () => L("Your order {number} is ready! You can pick it up at {place}. If you can't make it in the next few days, reply and we'll keep it longer.",
        "Заказ {number} готов! Забрать его можно по адресу {place}. Если в ближайшие дни не получается, напишите — подержим подольше."),
    ],
    formal: [
      () => L("Order {number} is ready for pickup at {place}.",
        "Заказ {number} готов к выдаче по адресу {place}."),
    ],
  },
  sent: {
    warm: [
      ({ delivery, track }) => delivery === "courier"
        ? L("The courier is already on the way with order {number}. They'll call before arriving.",
          "Курьер уже везёт заказ {number}, перед приездом он позвонит.")
        : track
          ? L("Order {number} is on its way with {carrier}. Tracking number: {track}, it shows where the parcel is.",
            "Заказ {number} отправлен: {carrier}, трек-номер {track}. По нему видно, где посылка.")
          : L("Order {number} has been shipped. We'll send the tracking number in a separate email.",
            "Заказ {number} отправлен. Трек-номер пришлём отдельным письмом."),
    ],
    formal: [
      ({ delivery, track }) => delivery === "courier"
        ? L("Order {number} has been handed to the courier. The courier will call you before delivery.",
          "Заказ {number} передан курьеру. Перед доставкой курьер свяжется с вами.")
        : L("Order {number} has been shipped ({carrier}). Tracking number: {track}.",
          "Заказ {number} отправлен ({carrier}). Трек-номер: {track}."),
    ],
  },
  done: {
    warm: [
      () => L("Thank you for order {number}! We hope everything arrived as expected. If you have a minute, a short review on the product page would help other customers a lot.",
        "Спасибо за заказ {number}! Надеемся, всё пришло как надо. Если найдётся минута, оставьте короткий отзыв на странице товара — он очень поможет другим покупателям."),
    ],
    formal: [
      () => L("Thank you for order {number}. We would be grateful for a review on the product page.",
        "Благодарим за заказ {number}. Будем признательны за отзыв на странице товара."),
    ],
  },
  address: {
    warm: [
      () => L("We're packing order {number} and need to check the address: the courier couldn't find the building. Could you send the street, building and flat, or a landmark? We'll hand the order to delivery right away.",
        "Собираем заказ {number} и хотим уточнить адрес: курьер не нашёл дом по указанному. Напишите, пожалуйста, улицу, дом и квартиру или удобный ориентир — и мы сразу передадим заказ в доставку."),
      () => L("Your order {number} is ready, but the delivery address looks incomplete. Please send the full address with the flat number and a phone the courier can call.",
        "Заказ {number} готов, но в адресе доставки чего-то не хватает. Пришлите, пожалуйста, полный адрес с квартирой и телефон, по которому курьер сможет позвонить."),
    ],
    formal: [
      () => L("To deliver order {number} we need to confirm the address: the one given could not be found. Please send the street, building and flat number. The order will go to delivery after that.",
        "Для доставки заказа {number} нужно уточнить адрес: указанный не удалось найти. Пожалуйста, пришлите улицу, номер дома и квартиры. После этого заказ будет передан в доставку."),
    ],
  },
  stock: {
    warm: [
      () => L("Sorry, “{product}” from order {number} has run out. We can wait for the next delivery, swap it for something similar or refund this item. Which would you prefer?",
        "Простите, товар «{product}» из заказа {number} закончился на складе. Можем дождаться поставки, заменить его на похожий или вернуть деньги за эту позицию. Как вам удобнее?"),
      () => L("Bad news about order {number}: “{product}” is out of stock. The rest of the order is ready. We can send it now and the missing item later, or wait and send everything together.",
        "Неприятная новость по заказу {number}: товар «{product}» закончился. Остальное уже собрано. Можем отправить сейчас, а недостающее — следом, или дождаться поставки и привезти всё вместе."),
    ],
    formal: [
      () => L("Unfortunately, “{product}” from order {number} is currently out of stock. We suggest waiting for the delivery, choosing a replacement or a refund for this item. Please let us know which option suits you.",
        "К сожалению, товара «{product}» из заказа {number} сейчас нет на складе. Предлагаем дождаться поставки, выбрать замену или оформить возврат за эту позицию. Сообщите, пожалуйста, какой вариант вам подходит."),
    ],
  },
  question: {
    warm: [
      ({ product }) => product
        ? L("Thanks for the question about “{product}”! {facts} {shipping} We can put it aside for you or place the order right away.",
          "Спасибо за вопрос про «{product}»! {facts} {shipping} Можем отложить товар для вас или сразу оформить заказ.")
        : L("Thanks for the question! {shipping} Let us check the rest and get back to you today.",
          "Спасибо за вопрос! {shipping} Остальное уточним и ответим сегодня же."),
      ({ product }) => product
        ? L("Good question! {facts} {shipping} If you like, we'll send a few more photos of “{product}”.",
          "Хороший вопрос! {facts} {shipping} Если хотите, пришлём ещё фото «{product}».")
        : L("Thank you for writing! {shipping} We'll answer the rest in detail during the day.",
          "Спасибо, что написали! {shipping} На остальное ответим подробно в течение дня."),
    ],
    formal: [
      ({ product }) => product
        ? L("Thank you for your question about “{product}”. {facts} {shipping} We can reserve it or arrange delivery.",
          "Благодарим за вопрос о товаре «{product}». {facts} {shipping} Можем зарезервировать его или оформить доставку.")
        : L("Thank you for your question. {shipping} We will reply with the details today.",
          "Благодарим за обращение. {shipping} Подробный ответ пришлём сегодня."),
    ],
  },
  review: {
    warm: [
      ({ rating, topic }) => (rating ?? 5) >= 5
        ? L("Thank you for the review! We're glad you liked {it}. We'll be happy to see you again.",
          "Спасибо за отзыв! Рады, что {it} вам по душе. Будем рады видеть вас снова.")
        : rating === 4
          ? L("Thank you for the detailed review! We're glad you liked {it}, and we'll pass your remark on to the supplier: reviews like this help us choose better products.",
            "Спасибо за подробный отзыв! Рады, что {it} вам по душе, а замечание передадим поставщику — такие отзывы помогают нам выбирать товары лучше.")
          : topic === "delivery"
            ? L("We're sorry the delivery went this way. We'll go through this case with the courier service so that it doesn't happen again. Thank you for telling us.",
              "Простите, что с доставкой так вышло. Мы разберём этот случай с курьерской службой, чтобы такое не повторилось. Спасибо, что написали об этом.")
            : L("Thank you for writing about it honestly. We're sorry the purchase didn't live up to expectations. Email us with the order number and we'll offer an exchange or a refund.",
              "Спасибо, что честно написали. Жаль, что покупка не оправдала ожиданий. Напишите нам на почту с номером заказа — предложим обмен или возврат."),
      ({ rating, topic }) => (rating ?? 5) >= 4
        ? L("What a nice review, thank you! Reviews like this keep us going.",
          "Какой приятный отзыв, спасибо! Ради таких мы и работаем.")
        : topic === "delivery"
          ? L("Sorry for the delay. We've passed your review on to the courier service and will check how deliveries in your city go.",
            "Простите за задержку. Отзыв передали курьерской службе и проверим, как идут доставки в вашем городе.")
          : L("We're sorry it turned out this way. Let's fix it: email us with the order number and we'll sort it out.",
            "Нам жаль, что так вышло. Давайте исправим: напишите нам на почту с номером заказа, и мы во всём разберёмся."),
    ],
    formal: [
      ({ rating, topic }) => (rating ?? 5) >= 4
        ? L("Thank you for your review. We are glad you were satisfied with the purchase.",
          "Благодарим за отзыв. Рады, что покупка вам понравилась.")
        : topic === "delivery"
          ? L("We apologise for the delivery delay. We will review this case with the courier service.",
            "Приносим извинения за задержку доставки. Мы разберём этот случай с курьерской службой.")
          : L("Thank you for your feedback. We apologise for the inconvenience and are ready to offer an exchange or a refund. Please email us with your order number.",
            "Благодарим за отзыв и приносим извинения. Готовы предложить обмен или возврат — напишите, пожалуйста, нам на почту и укажите номер заказа."),
    ],
  },
  callback: {
    warm: [
      () => L("You asked us to call back. We'll call today before 6 pm. If another time suits you better, just reply with it.",
        "Вы просили перезвонить — позвоним сегодня до 18:00. Если удобнее в другое время, напишите в ответ."),
    ],
    formal: [
      () => L("We have received your callback request. A manager will call you today before 6 pm.",
        "Мы получили вашу заявку на звонок. Менеджер свяжется с вами сегодня до 18:00."),
    ],
  },
  wholesale: {
    warm: [
      ({ list }) => list
        ? L("Thanks for the request! We'll work out wholesale prices and lead times for your list and send the offer today, together with the price list for businesses.",
          "Спасибо за заявку! Посчитаем оптовые цены и сроки по вашему списку и сегодня же пришлём предложение вместе с прайс-листом для юрлиц.")
        : L("Thanks for your interest in buying wholesale! We'll send the price list for businesses today. Tell us roughly which products and quantities you need, and we'll suggest the best terms.",
          "Спасибо за интерес к оптовым закупкам! Сегодня пришлём прайс-лист для юрлиц. Напишите, какие товары и примерно в каком количестве нужны, — подберём условия."),
    ],
    formal: [
      ({ list }) => list
        ? L("Thank you for your request. We will prepare an offer for your list and send it today together with the price list for businesses.",
          "Благодарим за заявку. Подготовим коммерческое предложение по вашему списку и направим его сегодня вместе с прайс-листом для юридических лиц.")
        : L("Thank you for your wholesale request. We will send the price list for businesses today. Please specify the products and volumes you need so that we can prepare an offer.",
          "Благодарим за оптовую заявку. Сегодня направим прайс-лист для юридических лиц. Уточните, пожалуйста, товары и объёмы — подготовим предложение."),
    ],
  },
  "pickup-question": {
    warm: [
      () => L("Yes, you can pick the order up yourself: {place}. We're open {hours}.{late} Choose “Pickup” at checkout and we'll write as soon as everything is packed.",
        "Да, заказ можно забрать самостоятельно: {place}. Мы работаем {hours}.{late} При оформлении выберите «Самовывоз» — напишем, когда всё будет собрано."),
    ],
    formal: [
      () => L("Yes, the order can be picked up at {place}. Opening hours: {hours}.{late} Choose “Pickup” at checkout and we will let you know when the order is ready.",
        "Да, заказ можно получить самовывозом по адресу: {place}. Часы работы: {hours}.{late} При оформлении выберите способ получения «Самовывоз», и мы сообщим, когда заказ будет готов."),
    ],
  },
  "invoice-request": {
    warm: [
      () => L("We'll prepare the invoice and email it today.", "Счёт подготовим и пришлём на почту сегодня."),
    ],
    formal: [
      () => L("The invoice will be sent to your email today.", "Счёт будет направлен на вашу почту сегодня."),
    ],
  },
  other: {
    warm: [() => L("Thank you for writing! We've got your message and will answer in detail during the day.", "Спасибо, что написали! Мы получили сообщение и ответим подробно в течение дня.")],
    formal: [() => L("Thank you for your message. We will reply in detail during the day.", "Благодарим за обращение. Подробный ответ направим в течение дня.")],
  },
};

/* Что известно о товаре: есть ли, сколько, почём. */
function facts(product) {
  if (!product) return "";
  const parts = [];
  if (product.stock != null) parts.push(product.stock > 0 ? L("In stock: {stock} pcs.", "В наличии: {stock} шт.") : L("It's out of stock right now, we'll write as soon as it's back.", "Сейчас его нет в наличии — напишем, как только появится."));
  if (product.price != null) parts.push(L("The price is {price}.", "Цена — {price}."));
  return fill(parts.join(" "), { stock: number(product.stock ?? 0), price: product.price != null ? money(product.price) : "" });
}

/* Номер для текста письма: «№ 18452», у строки с буквами — как есть. */
const no = (value) => (value == null || value === "" ? "" : /^\d+$/.test(String(value)) ? L(`#${value}`, `№\u00a0${value}`) : String(value));
const CARRIER = { cdek: () => L("CDEK", "СДЭК"), post: () => L("Russian Post", "Почта России") };
/* Повод «status» — по тому, где сейчас заказ. */
const BY_STATUS = { new: "confirm", work: "confirm", sent: "sent", done: "done" };

function compose(kind, info, turn) {
  const { tone, signature } = voice();
  const style = tone === "formal" ? "formal" : "warm";
  const bodies = (BODY[kind] ?? BODY.other)[style];
  const name = String(info.name ?? "").trim();
  const order = info.order ?? {};
  const vars = {
    name,
    first: name.split(/\s+/)[0] || L("there", "здравствуйте"),
    number: no(order.number),
    sum: order.total != null ? money(order.total) : "",
    invoice: no(order.invoice),
    carrier: CARRIER[order.delivery]?.() ?? "",
    track: order.track ?? "",
    place: info.place ?? order.place ?? "",
    hours: info.hours ?? "",
    late: info.late ? ` ${info.late}` : "",
    shipping: info.shipping ?? "",
    product: info.product?.name ?? "",
    it: info.product?.name ? `«${info.product.name}»` : L("the purchase", "покупка"),
    facts: facts(info.product),
  };
  const greet = name ? GREET[style][turn % GREET[style].length]() : L("Hello,", "Здравствуйте!");
  const body = bodies[turn % bodies.length]({ status: order.status, delivery: order.delivery, track: order.track, product: info.product?.name, rating: info.rating, topic: info.topic, list: info.list });
  const close = CLOSE[style][Math.floor(turn / bodies.length) % CLOSE[style].length]();
  return [fill(greet, vars), fill(body, vars).replace(/\s{2,}/g, " ").trim(), [close, signature].filter(Boolean).join("\n")].join("\n\n");
}

/* Черновик письма и «Другой вариант» к нему. */
export function draftReply(info = {}) {
  let turn = 0;
  const kind = info.kind === "status" ? BY_STATUS[info.order?.status] ?? "other" : info.kind ?? "other";
  return {
    text: compose(kind, info, turn),
    again: () => compose(kind, info, ++turn),
  };
}
