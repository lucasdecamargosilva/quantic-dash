export const saoPauloDay = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const shiftDay = (day: string, days: number) => new Date(Date.parse(day + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
export const eventDay = (value?: string | null) => !value ? null : value.length === 10 ? value : saoPauloDay(new Date(value));
export const inPeriod = (value: string | null | undefined, from: string, to: string) => { const day = eventDay(value); return !!day && day >= from && day <= to; };
export const dateLabel = (day: string) => day.split("-").reverse().join("/");
