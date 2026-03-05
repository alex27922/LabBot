let currentQueue = [];
let currentTitle = "";
let messageIdMap = null;

const group1 = [
  "Бабляк","Воробей","Ворожбит","Воронцова","Голубенко","Гончар","Дацко",
  "Дубнюк","Дячок","Катеренчук","Кияненко","Кравченко","Скороход","Трегуб"
];

const group2 = [
  "Дворжак","Карпіленко","Носаченко","Павловський","Петрова","Прилипко",
  "Руколянська","Сидоренко","Скорик","Соколов","Чахлеу","Чернов","Чумак",
  "Шаповал","Шиба"
];

const allStudents = [...group1, ...group2];

// Fisher–Yates shuffle
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Оновлюємо повідомлення черги
async function updateMessage(chatId) {
  if (!messageIdMap) return;
  let message = currentTitle + "\n";
  currentQueue.forEach((item, i) => {
    message += `${i + 1}. ${item.name}${item.status ? " " + item.status : ""}\n`;
  });

  try {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageIdMap,
        text: message
      })
    });
  } catch (e) {
    console.error("Failed to update message:", e);
  }
}

export default async function handler(req, res) {
  try {
    const body = req.body;
    if (!body?.message) return res.status(200).send("ok");

    const chatId = body.message.chat.id;
    const text = body.message.text?.trim();
    if (!text) return res.status(200).send("ok");

    let students = null;
    let subject = "";

    // --- Генерація черги ---
    if (text.startsWith("/generate_1")) {
      students = group1;
      subject = text.replace("/generate_1", "").trim();
      currentTitle = `Черга ${subject ? " з " + subject : ""} (Підгрупа 1):`;
    } else if (text.startsWith("/generate_2")) {
      students = group2;
      subject = text.replace("/generate_2", "").trim();
      currentTitle = `Черга ${subject ? " з " + subject : ""} (Підгрупа 2):`;
    } else if (text.startsWith("/generate")) {
      students = allStudents;
      subject = text.replace("/generate", "").trim();
      currentTitle = `Черга ${subject ? " з " + subject : ""} (вся група):`;
    }

    if (students) {
      currentQueue = shuffle(students).map(name => ({ name, status: "" }));
      let message = currentTitle + "\n";
      currentQueue.forEach((item, i) => message += `${i + 1}. ${item.name}\n`);

      const resp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message })
      });
      const data = await resp.json();
      if (data.ok) messageIdMap = data.result.message_id;

      return res.status(200).send("ok");
    }

    // --- Обробка + / - у будь-якому повідомленні ---
    const match = text.match(/^(\S+)\s*([+-])$/);
    if (match) {
      const surname = match[1];
      const action = match[2]; // "+" або "-"
      const student = currentQueue.find(s => s.name === surname);
      if (student) {
        student.status = action; // ставимо "+" або "-"
        await updateMessage(chatId);
      }
      return res.status(200).send("ok");
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("Webhook error:", e);
    return res.status(200).send("ok"); // Telegram не отримає 500
  }
}