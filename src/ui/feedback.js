// «Баг / идея»: адрес новой задачи в GitHub Issues с заполненными заголовком и текстом
export const SITE = 'https://flew96.github.io/facets/';
export const ISSUES = 'https://github.com/flew96/facets/issues/new';
const MAX_LINK = 6000; // адрес страницы GitHub не может быть бесконечным

/** Ссылка на задачу для сообщения: с локального сервера она бесполезна, поэтому ведёт на сайт */
export function publicLink(origin, pathname, code) {
  const local = /^https?:\/\/(localhost|127\.|\[::1\])/.test(origin);
  return `${local ? SITE : origin + pathname}#s=${code}`;
}

/** { bug, summary, details, figure, items, conds, link? } → адрес страницы новой задачи */
export function issueUrl({ bug, summary, details, figure, items, conds, link }) {
  const title = `${bug ? '[Баг]' : '[Идея]'} ${summary}`;
  let body = details || (bug ? '_Опишите, что делали, что ожидали и что получилось._' : '_Опишите идею._');
  body += `\n\n---\nФигура: ${figure}; построений: ${items}; условий: ${conds}.`;
  if (link !== undefined) {
    body += link.length < MAX_LINK ? `\n[Открыть задачу](${link})` : '\n_Ссылка на задачу слишком длинная — приложите файл (кнопка «Сохранить»)._';
  }
  return `${ISSUES}?${new URLSearchParams({ title, body, labels: bug ? 'bug' : 'enhancement' })}`;
}
