let queues = new Map(); // key = message_id, value = {title, students: [{name, status}]}

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
async function updateQueueMessage(chatId, messageId) {
  const queue = queues.get(messageId);
  if (!queue) return;

  let message = queue.title + "\n";
  queue.students.forEach((item, i) => {
    message += `${i + 1}. ${item.name}${item.status ? " " + item.status : ""}\n`;
  });

  try {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
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
      var title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 1):`;
    } else if (text.startsWith("/generate_2")) {
      students = group2;
      subject = text.replace("/generate_2", "").trim();
      var title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 2):`;
    } else if (text.startsWith("/generate")) {
      students = allStudents;
      subject = text.replace("/generate", "").trim();
      var title = `Черга здачі${subject ? " з " + subject : ""} (вся група):`;
    }

    if (students) {
      const shuffled = shuffle(students).map(name => ({ name, status: "" }));
      let message = title + "\n";
      shuffled.forEach((item, i) => message += `${i + 1}. ${item.name}\n`);

      const resp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message })
      });

      const data = await resp.json();
      if (data.ok) {
        queues.set(data.result.message_id, { title, students: shuffled });
      }
      return res.status(200).send("ok");
    }

    // --- Обробка + / - для будь-якої черги ---
    const replyId = body.message.reply_to_message?.message_id;
    if (replyId && queues.has(replyId)) {
      const plusMinus = text.match(/^(\S+)\s*([+-])$/);
      if (plusMinus) {
        const [_, surname, action] = plusMinus;
        const queue = queues.get(replyId);
        const student = queue.students.find(s => s.name === surname);
        if (student) {
          student.status = action; // ставимо "+" або "-"
          await updateQueueMessage(chatId, replyId);
        }
        return res.status(200).send("ok");
      }

      // --- /swap у reply ---
      if (text.startsWith("/swap")) {
        const args = text.replace("/swap", "").trim().split(/\s+/);
        if (args.length === 2) {
          const [firstSurname, secondSurname] = args;
          const queue = queues.get(replyId);
          const firstIndex = queue.students.findIndex(s => s.name === firstSurname);
          const secondIndex = queue.students.findIndex(s => s.name === secondSurname);
          if (firstIndex !== -1 && secondIndex !== -1) {
            [queue.students[firstIndex], queue.students[secondIndex]] =
              [queue.students[secondIndex], queue.students[firstIndex]];
            await updateQueueMessage(chatId, replyId);
          }
        }
        return res.status(200).send("ok");
      }
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("Webhook error:", e);
    return res.status(200).send("ok");
  }
}