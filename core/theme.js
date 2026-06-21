/* 主題切換：設定 <html data-theme> 並存 localStorage */
Platform.theme = {
  list: ['felt', 'noir', 'jade'],
  current: 'felt',
  set(name) {
    if (!this.list.includes(name)) name = 'felt';
    this.current = name;
    document.documentElement.dataset.theme = name;
    Platform.store.set('arcade_theme', name);
  },
  init() { this.set(Platform.store.get('arcade_theme', 'felt')); },
};
Platform.theme.init();
