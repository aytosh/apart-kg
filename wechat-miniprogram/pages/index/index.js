const api = require("../../utils/api.js");

Page({
  data: {
    items: [],
    deal: "",
    district: "",
    loading: false,
  },
  onLoad() {
    this.load();
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  bindDeal(e) {
    this.setData({ deal: e.detail.value });
  },
  bindDistrict(e) {
    this.setData({ district: e.detail.value });
  },
  search() {
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.fetchListings({ deal: this.data.deal, district: this.data.district });
      this.setData({ items: data.items || [] });
    } catch (err) {
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },
});
