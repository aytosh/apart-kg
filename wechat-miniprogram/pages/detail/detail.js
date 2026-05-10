const api = require("../../utils/api.js");

Page({
  data: { listing: null, qrUrl: "", wechatQrUrl: "" },
  async onLoad(options) {
    try {
      const listing = await api.fetchListing(options.id);
      this.setData({
        listing,
        qrUrl: listing.qr,
        wechatQrUrl: listing.owner && listing.owner.wechatQr ? listing.owner.wechatQr : "",
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },
  copyWechat() {
    const wid = this.data.listing && this.data.listing.owner && this.data.listing.owner.wechatId;
    if (wid) {
      wx.setClipboardData({ data: wid, success: () => wx.showToast({ title: "已复制微信号" }) });
    }
  },
});
