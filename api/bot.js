const students = [
  "Бабляк Анна-Марія Сергіївна",
  "Воробей Серафим Олександрович",
  "Ворожбит Дарія Ігорівна",
  "Воронцова Єва Борисівна",
  "Голубенко Назар Валентинович",
  "Гончар Світлана Ігорівна",
  "Дацко Віталій Петрович",
  "Дворжак Костянтин Олександрович",
  "Дубнюк Дарина Анатоліївна",
  "Дячок Дам'ян Іванович",
  "Карпіленко Анна Ігорівна",
  "Катеренчук Олександр Юрійович",
  "Кияненко Євген Антонович",
  "Кравченко Анастасія Олександрівна",
  "Носаченко Олексій Дмитрович",
  "Павловський Данііл Максимович",
  "Петрова Дар'я Олегівна",
  "Прилипко Дар'я Олегівна",
  "Руколянська Вікторія Євгенівна",
  "Сидоренко Катерина Андріївна",
  "Скорик Антон Олександрович",
  "Скороход Андрій Володимирович",
  "Соколов Ярослав Костянтинович",
  "Трегуб Назар Русланович",
  "Чахлеу Єва Костятинівна",
  "Чернов Сергій Олександрович",
  "Чумак Богдан Олексійович",
  "Шаповал Нікіта Олександрович",
  "Шиба Адріана Вячеславівна",
];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default async function handler(req, res) {
  const body = req.body;

  if (!body?.message) {
    return res.status(200).send("ok");
  }

  const chatId = body.message.chat.id;
  const text = body.message.text;

  if (text === "/generate") {
    const queue = shuffle(students);

    let message = "Черга здачі лабораторної:\n\n";

    queue.forEach((name, i) => {
      message += `${i + 1}. ${name}\n`;
    });

    await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      },
    );
  }

  res.status(200).send("ok");
}
