// node tests/camera.test.mjs
import { openCameraStream } from "../dist/camera.js";
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log("FAIL", n)); };
const MAC = { kind: "videoinput", deviceId: "mac", label: "FaceTime HD Camera" };
const PHONE = { kind: "videoinput", deviceId: "phone", label: "someone's iPhone Camera" };
function fake(devices, { namesBefore = true, fail = null } = {}) {
  const asked = []; const stopped = []; let allowed = namesBefore;
  return {
    asked, stopped,
    enumerateDevices: async () => devices.map((d) => (allowed ? d : { ...d, label: "" })),
    getUserMedia: async ({ video }) => {
      asked.push(video);
      const id = video.deviceId?.exact ?? devices[0].deviceId; // the browser's own pick is the first one
      if (id === fail) throw new Error("busy");
      allowed = true;
      const track = { label: devices.find((d) => d.deviceId === id).label, stop: () => stopped.push(id) };
      return { getVideoTracks: () => [track], getTracks: () => [track] };
    },
  };
}
const want = { facingMode: "user", width: { ideal: 1280 } };
const label = (s) => s.getVideoTracks()[0].label;
let m = fake([PHONE, MAC]); let s = await openCameraStream(want, { mediaDevices: m, anyCamera: false });
t("known names: the Mac camera at once", label(s) === MAC.label && m.asked.length === 1 && !("facingMode" in m.asked[0]));
m = fake([PHONE, MAC], { namesBefore: false }); s = await openCameraStream(want, { mediaDevices: m, anyCamera: false });
t("first visit: switches and releases the phone", label(s) === MAC.label && m.stopped.join() === "phone");
m = fake([PHONE]); s = await openCameraStream(want, { mediaDevices: m, anyCamera: false });
t("a phone alone is used", label(s) === PHONE.label && m.stopped.length === 0);
m = fake([PHONE, MAC], { fail: "mac" }); s = await openCameraStream(want, { mediaDevices: m, anyCamera: false });
t("a busy camera leaves the other", label(s) === PHONE.label && m.stopped.length === 0);
m = fake([PHONE, MAC]); s = await openCameraStream(want, { mediaDevices: m, anyCamera: true });
t("camera=any keeps the browser's pick", label(s) === PHONE.label);
m = fake([MAC]); s = await openCameraStream(want, { mediaDevices: m, anyCamera: false });
t("no phone: request untouched", m.asked[0].facingMode === "user");
console.log(bad ? `${bad} FAILED` : `ALL PASSED (${ok})`);
