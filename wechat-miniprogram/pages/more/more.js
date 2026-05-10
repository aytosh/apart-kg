Page({
  openWeb() {
    wx.setClipboardData({
      data: "https://apart.kg",
      success: () => wx.showToast({ title: "已复制网址" }),
    });
  },
});
