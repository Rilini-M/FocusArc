function success(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data });
}

function failure(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

module.exports = { success, failure };
