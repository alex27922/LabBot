let currentQueue = []; // поточна черга
let messageIdMap = null; // зберігаємо message_id повідомлення з чергою

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

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Допоміжна функція для оновлення повідомлення
async function updateMessage(chatId, title) {
  let message = title;
  currentQueue.forEach((item,i)=>{
    message += `${i+1}. ${item.name}${item.done ? " +" : ""}\n`;
  });

  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageIdMap,
      text: message
    })
  });
}

export default async function handler(req, res) {
  const body = req.body;
  if (!body?.message) return res.status(200).send("ok");

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  let students = null;
  let title = "";

  // --- Генерація черги ---
  if (text.startsWith("/generate_1")) {
    students = group1;
    title = "Черга здачі (Підгрупа 1):\n\n";
  } else if (text.startsWith("/generate_2")) {
    students = group2;
    title = "Черга здачі (Підгрупа 2):\n\n";
  } else if (text.startsWith("/generate")) {
    students = allStudents;
    title = "Черга здачі (вся група):\n\n";
  }

  if (students) {
    currentQueue = shuffle(students).map(name => ({name, done:false}));
    let message = title;
    currentQueue.forEach((item,i)=> message += `${i+1}. ${item.name}\n`);

    const resp = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    const data = await resp.json();
    if(data.ok) messageIdMap = data.result.message_id;
    return res.status(200).send("ok");
  }

  // --- Обробка "+" або "-" ---
  const replyId = body.message.reply_to_message?.message_id;
  if(replyId && messageIdMap && replyId === messageIdMap) {
    // Формат: "Прізвище +" або "Прізвище -"
    const match = text.match(/^(\S+)\s*([+-])$/);
    if(match) {
      const surname = match[1];
      const action = match[2]; // "+" або "-"
      const student = currentQueue.find(s => s.name === surname);

      if(student) {
        student.done = action === "+"; // "+" = true, "-" = false
        await updateMessage(chatId, "Черга здачі (вся група):\n\n");
      }
    }
    return res.status(200).send("ok");
  }

  res.status(200).send("ok");
}