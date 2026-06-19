import CuratorTabsPage from './CuratorTabsPage';
import BooksRunPage from './BooksRunPage';
import { bookTotal } from '../data/books';
import { seenBefore } from '../lib/book';
import { getUserMarksByKind } from '../data/userMarks';

// 读书 curator：左「书架·我的书」(藏书票名录) + 右「对话·读书」。
// 推荐去重：已读全集(douban 1000+ 本)当「排除集 + 口味源」、不当推荐池——
// context 只声明已读规模（不再喂具体书名种子诱导复述），口味画像由记忆中枢(memoryRouter)注入；
// checkSeen 做确定性兜底，把云脑误推的已读书当场标出来。

export default function BooksCuratorPage({ onBack }: { onBack: () => void }) {
  return (
    <CuratorTabsPage
      onBack={onBack}
      title="BOOKS-CURATOR"
      leftLabel="书架"
      rightLabel="Frost_Book"
      left={<BooksRunPage onBack={onBack} embedded />}
      chat={{
        accent: '#b388ff',
        persona: '你是「读书」agent，懂文学、了解用户的读书口味，按口味推荐 ta 没读过的好书、把读过的书串成主题、聊作者与故事之地。',
        context: () => {
          const user = getUserMarksByKind('book').map((m) => `《${m.label}》`).join('、');
          return `我读过 ${bookTotal} 本书（覆盖很广，名著经典多半读过了）。${user ? `最近记录：${user}。` : ''}\n要推荐就只推我大概率没读过的冷门 / 小众，别推名著——我多半读过了。`;
        },
        placeholder: '聊聊书 / 想读什么…',
        suggestions: ['推荐三本我没读过但对味的', '我读过的书里哪些讲孤独？', '推荐适合雨夜读的冷门书'],
        intentLabels: ['推荐', '讨论', '找书', '其他'],
        checkSeen: (t) => { const r = seenBefore(t); return r ? (r.date ? r.date.slice(0, 4) + ' 读过' : '读过') : null; },
      }}
    />
  );
}
