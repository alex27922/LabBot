let queues = new Map(); // message_id -> {title, students}

const group1 = [
"Бабляк","Воробей","Ворожбит","Воронцова","Голубенко","Гончар","Дацко",
"Дубнюк","Дячок","Катеренчук","Кияненко","Кравченко","Скороход","Трегуб"
];

const group2 = [
"Дворжак","Карпіленко","Носаченко","Павловський","Петрова","Прилипко",
"Руколянська","Сидоренко","Скорик","Соколов","Чахлеу","Чернов","Чумак",
"Шаповал","Шиба"
];

const allStudents = [...group1,...group2];

function shuffle(arr){
  const result=[...arr];
  for(let i=result.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

async function updateQueue(chatId,messageId){
  const queue=queues.get(messageId);
  if(!queue)return;

  let text=queue.title+"\n";
  queue.students.forEach((s,i)=>{
    text+=`${i+1}. ${s.name}${s.status?" "+s.status:""}\n`;
  });

  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      chat_id:chatId,
      message_id:messageId,
      text
    })
  });
}

export default async function handler(req,res){
try{

const body=req.body;
if(!body?.message) return res.status(200).send("ok");

const chatId=body.message.chat.id;
const text=body.message.text?.trim();
if(!text) return res.status(200).send("ok");

let students=null;
let subject="";
let title="";

if(text.startsWith("/generate_1")){
  students=group1;
  subject=text.replace("/generate_1","").trim();
  title=`Черга ${subject?" з "+subject:""} (Підгрупа 1):`;
}
else if(text.startsWith("/generate_2")){
  students=group2;
  subject=text.replace("/generate_2","").trim();
  title=`Черга ${subject?" з "+subject:""} (Підгрупа 2):`;
}
else if(text.startsWith("/generate")){
  students=allStudents;
  subject=text.replace("/generate","").trim();
  title=`Черга ${subject?" з "+subject:""} (вся група):`;
}

if(students){

  const shuffled=shuffle(students).map(name=>({name,status:""}));

  let message=title+"\n";
  shuffled.forEach((s,i)=>message+=`${i+1}. ${s.name}\n`);

  const resp=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId,text:message})
  });

  const data=await resp.json();

  if(data.ok){
    queues.set(data.result.message_id,{
      title,
      students:shuffled
    });
  }

  return res.status(200).send("ok");
}

const replyId=body.message.reply_to_message?.message_id;

if(replyId && queues.has(replyId)){

  const queue=queues.get(replyId);

  // PLUS / MINUS
  const pm=text.match(/^(\S+)\s*([+-])$/);
  if(pm){
    const surname=pm[1];
    const action=pm[2];

    const student=queue.students.find(s=>s.name===surname);
    if(student){
      student.status=action;
      await updateQueue(chatId,replyId);
    }

    return res.status(200).send("ok");
  }

  // SWAP
  if(text.startsWith("/swap")){
    const args=text.replace("/swap","").trim().split(/\s+/);
    if(args.length===2){
      const [a,b]=args;

      const i1=queue.students.findIndex(s=>s.name===a);
      const i2=queue.students.findIndex(s=>s.name===b);

      if(i1!==-1 && i2!==-1){
        [queue.students[i1],queue.students[i2]]=[queue.students[i2],queue.students[i1]];
        await updateQueue(chatId,replyId);
      }
    }

    return res.status(200).send("ok");
  }

  // MOVE
  if(text.startsWith("/move")){
    const args=text.replace("/move","").trim().split(/\s+/);

    if(args.length===2){

      const surname=args[0];
      let newPos=parseInt(args[1]);

      const index=queue.students.findIndex(s=>s.name===surname);

      if(index!==-1){

        const student=queue.students.splice(index,1)[0];

        if(newPos<1)newPos=1;
        if(newPos>queue.students.length+1)newPos=queue.students.length+1;

        queue.students.splice(newPos-1,0,student);

        await updateQueue(chatId,replyId);
      }
    }

    return res.status(200).send("ok");
  }

}

return res.status(200).send("ok");

}catch(e){
console.error(e);
return res.status(200).send("ok");
}
}