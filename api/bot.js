let queues = new Map(); // message_id -> {title, students, history, snapshots}
let users = new Map(); // user_id -> surname

const group1 = [
  "Бабляк",
  "Воробей",
  "Ворожбит",
  "Воронцова",
  "Голубенко",
  "Гончар",
  "Дацко",
  "Дубнюк",
  "Дячок",
  "Катеренчук",
  "Кияненко",
  "Кравченко",
  "Скороход",
  "Трегуб",
];

const group2 = [
  "Дворжак",
  "Карпіленко",
  "Носаченко",
  "Павловський",
  "Петрова",
  "Прилипко",
  "Руколянська",
  "Сидоренко",
  "Скорик",
  "Соколов",
  "Чахлеу",
  "Чернов",
  "Чумак",
  "Шаповал",
  "Шиба",
];

const allStudents = [...group1, ...group2];

function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function updateQueue(chatId, messageId) {
  const queue = queues.get(messageId);
  if (!queue || !queue.students) return;

  let text = queue.title + "\n";
  queue.students.forEach((s, i) => {
    text += `${i + 1}. ${s.name}${s.status ? " " + s.status : ""}\n`;
  });

  if (queue.history.length) {
    text += "\n<blockquote expandable>\n";
    queue.history.slice(-20).forEach((h) => (text += h + "\n"));
    text += "</blockquote>";
  }

  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: "HTML",
        }),
      },
    );
  } catch (e) {
    console.error("updateQueue error:", e);
  }
}

export default async function handler(req, res) {
  try {
    const body = req.body;
    if (!body?.message) return res.status(200).send("ok");

    const chatId = body.message.chat.id;
    const text = body.message.text?.trim();
    const userId = body.message.from?.id;
    const user = body.message.from?.first_name || "user";
    if (!text) return res.status(200).send("ok");

    // Прив'язка користувача до прізвища
    if (text.startsWith("/me")) {
      const surname = text.replace("/me", "").trim();
      if (surname) {
        users.set(userId, surname);
        try {
          await fetch(
            `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: `Тепер ти зареєстрований як ${surname}`,
              }),
            },
          );
        } catch (e) {
          console.error(e);
        }
      }
      return res.status(200).send("ok");
    }

    // Генерація черги
    let students = null,
      subject = "",
      title = "";
    if (text.startsWith("/generate_1")) {
      students = group1;
      subject = text.replace("/generate_1", "").trim();
      title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 1):`;
    } else if (text.startsWith("/generate_2")) {
      students = group2;
      subject = text.replace("/generate_2", "").trim();
      title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 2):`;
    } else if (text.startsWith("/generate")) {
      students = allStudents;
      subject = text.replace("/generate", "").trim();
      title = `Черга здачі${subject ? " з " + subject : ""} (вся група):`;
    }

    if (students) {
      const shuffled = shuffle(students).map((name) => ({ name, status: "" }));
      let message = title + "\n";
      shuffled.forEach((s, i) => (message += `${i + 1}. ${s.name}\n`));

      let data;
      try {
        const resp = await fetch(
          `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: message }),
          },
        );
        data = await resp.json();
      } catch (e) {
        console.error(e);
        return res.status(200).send("ok");
      }

      if (data.ok) {
        queues.set(data.result.message_id, {
          title,
          students: shuffled,
          history: [],
          snapshots: [],
        });
      }
      return res.status(200).send("ok");
    }

    const replyId = body.message.reply_to_message?.message_id;
    if (replyId && queues.has(replyId)) {
      const queue = queues.get(replyId);

      // UNDO
      if (text.startsWith("/undo")) {
        const last = queue.snapshots.pop();
        if (last) {
          queue.students = JSON.parse(JSON.stringify(last.students));
          queue.history.push(`undo (${user})`);
          await updateQueue(chatId, replyId);
        }
        return res.status(200).send("ok");
      }

      // PLUS / MINUS
      const pm = text.match(/^(\S+)\s*([+-])$/);
      if (pm) {
        queue.snapshots.push({
          students: JSON.parse(JSON.stringify(queue.students)),
        });
        const surname = pm[1],
          action = pm[2];
        const student = queue.students.find((s) => s.name === surname);
        if (student) {
          const oldStatus = student.status || "-";
          student.status = action;
          queue.history.push(`${surname}: ${oldStatus} → ${action} (${user})`);
          await updateQueue(chatId, replyId);
        }
        return res.status(200).send("ok");
      }

      // SWAP
      if (text.startsWith("/swap")) {
        const args = text.replace("/swap", "").trim().split(/\s+/);
        if (args.length === 2) {
          queue.snapshots.push({
            students: JSON.parse(JSON.stringify(queue.students)),
          });
          const a = args[0],
            b = args[1];
          const i1 = queue.students.findIndex((s) => s.name === a);
          const i2 = queue.students.findIndex((s) => s.name === b);
          if (i1 !== -1 && i2 !== -1) {
            [queue.students[i1], queue.students[i2]] = [
              queue.students[i2],
              queue.students[i1],
            ];
            queue.history.push(
              `swap ${a}(${i1 + 1}) ↔ ${b}(${i2 + 1}) (${user})`,
            );
            await updateQueue(chatId, replyId);
          }
        }
        return res.status(200).send("ok");
      }

      // MOVE
      if (text.startsWith("/move")) {
        const args = text.replace("/move", "").trim().split(/\s+/);
        if (args.length === 2) {
          queue.snapshots.push({
            students: JSON.parse(JSON.stringify(queue.students)),
          });
          const surname = args[0];
          let newPos = parseInt(args[1]);
          const index = queue.students.findIndex((s) => s.name === surname);
          if (index !== -1) {
            const student = queue.students.splice(index, 1)[0];
            const oldPos = index + 1;
            if (newPos < 1) newPos = 1;
            if (newPos > queue.students.length + 1)
              newPos = queue.students.length + 1;
            queue.students.splice(newPos - 1, 0, student);
            queue.history.push(`${surname}: ${oldPos} → ${newPos} (${user})`);
            await updateQueue(chatId, replyId);
          }
        }
        return res.status(200).send("ok");
      }
    }

    // RESTORE для старих повідомлень
    if (text.startsWith("/restore")) {
      const reply = body.message.reply_to_message;
      if (!reply?.text || !reply.message_id) return res.status(200).send("ok");
      const lines = reply.text.split("\n");
      const title = lines[0];
      const students = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const match = line.match(/^\d+\.\s+(\S+)(?:\s+([+-]))?/);
        if (match) students.push({ name: match[1], status: match[2] || "" });
      }
      if (students.length > 0) {
        queues.set(reply.message_id, {
          title,
          students,
          history: [],
          snapshots: [],
        });
      }
      return res.status(200).send("ok");
    }

    return res.status(200).send("ok");
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(200).send("ok");
  }
}
