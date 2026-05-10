const app = getApp();

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + url,
      method: options.method || "GET",
      data: options.data || {},
      header: options.header || {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data && res.data.error ? res.data.error : `HTTP ${res.statusCode}`));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

module.exports = {
  fetchListings: (params) => request(`/api/zh/listings${buildQuery(params)}`),
  fetchListing: (id) => request(`/api/zh/listings/${id}`),
};

function buildQuery(params) {
  if (!params) return "";
  const out = [];
  Object.keys(params).forEach((k) => {
    if (params[k] != null && params[k] !== "") {
      out.push(`${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`);
    }
  });
  return out.length ? "?" + out.join("&") : "";
}
