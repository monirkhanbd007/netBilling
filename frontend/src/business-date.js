const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'});

export function today(at=new Date()){
 const parts=Object.fromEntries(formatter.formatToParts(at).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}

export const monthNow=(at=new Date())=>today(at).slice(0,7);
