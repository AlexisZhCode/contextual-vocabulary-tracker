/**
 * Compact EN→ZH glosses aligned with ECDICT field semantics for MVP offline hits.
 * Full ECDICT SQLite is wired via EXPO_PUBLIC_API_URL /v1/define when the API is running.
 */
export const LOCAL_ECDICT: Record<
  string,
  { phonetic?: string; pos?: string; translation: string; definition?: string }
> = {
  adapt: {
    phonetic: 'əˈdæpt',
    pos: 'v',
    translation: '适应；改编',
    definition: 'to adjust to new conditions; to modify for a new use',
  },
  adaptation: {
    phonetic: 'ˌædæpˈteɪʃn',
    pos: 'n',
    translation: '适应；改编作品',
  },
  resilient: {
    phonetic: 'rɪˈzɪliənt',
    pos: 'adj',
    translation: '有弹性的；能复原的；适应力强的',
    definition: 'able to recover quickly from difficult conditions',
  },
  wistful: {
    phonetic: 'ˈwɪstfəl',
    pos: 'adj',
    translation: '惆怅的；渴望的',
    definition: 'having or showing a feeling of vague or regretful longing',
  },
  incandescent: {
    phonetic: 'ˌɪnkænˈdesənt',
    pos: 'adj',
    translation: '炽热的；辉耀的；热情洋溢的',
  },
  labyrinth: {
    phonetic: 'ˈlæbərɪnθ',
    pos: 'n',
    translation: '迷宫；错综复杂',
  },
  anthropocene: {
    phonetic: 'ˈænθrəpəˌsiːn',
    pos: 'n',
    translation: '人类世',
  },
  orthodoxy: {
    phonetic: 'ˈɔːθədɒksi',
    pos: 'n',
    translation: '正统观念；正统做法',
  },
  ephemeral: {
    phonetic: 'ɪˈfemərəl',
    pos: 'adj',
    translation: '短暂的；朝生暮死的',
  },
  serendipity: {
    phonetic: 'ˌserənˈdɪpɪti',
    pos: 'n',
    translation: '意外发现珍奇事物的本领；机缘凑巧',
  },
  melancholy: {
    phonetic: 'ˈmelənkɒli',
    pos: 'n/adj',
    translation: '忧郁；愁思',
  },
  eloquent: {
    phonetic: 'ˈeləkwənt',
    pos: 'adj',
    translation: '雄辩的；有说服力的',
  },
  meticulous: {
    phonetic: 'məˈtɪkjələs',
    pos: 'adj',
    translation: '一丝不苟的；细致的',
  },
  ubiquitous: {
    phonetic: 'juːˈbɪkwɪtəs',
    pos: 'adj',
    translation: '无处不在的；普遍存在的',
  },
  ambiguous: {
    phonetic: 'æmˈbɪɡjuəs',
    pos: 'adj',
    translation: '模棱两可的；含糊的',
  },
  poignant: {
    phonetic: 'ˈpɔɪnjənt',
    pos: 'adj',
    translation: '深刻的；辛酸的；尖锐的',
  },
  luminous: {
    phonetic: 'ˈluːmɪnəs',
    pos: 'adj',
    translation: '发光的；明亮的；睿智的',
  },
};
