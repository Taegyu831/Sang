// Which camera to open. A Mac offers a nearby iPhone as a camera (Continuity Camera) and the
// browser may pick it by itself, above all when a size is asked that the built-in camera does not
// have. The computer's own camera (or a plugged-in webcam) is taken instead whenever there is one.
// ?camera=any leaves the choice to the browser.

const PHONE = /iphone|ipad|continuity|desk ?view|데스크 ?뷰/i;

const otherThanPhone = (devices) => {
  const cameras = devices.filter((d) => d.kind === "videoinput" && d.label);
  return cameras.some((d) => PHONE.test(d.label)) ? cameras.find((d) => !PHONE.test(d.label)) ?? null : null;
};
const only = (video, device) => {
  const { facingMode, ...rest } = video;
  return { ...rest, deviceId: { exact: device.deviceId } };
};

export async function openCameraStream(video, {
  mediaDevices = navigator.mediaDevices,
  anyCamera = new URLSearchParams(globalThis.location?.search ?? "").get("camera") === "any",
} = {}) {
  const ask = (v) => mediaDevices.getUserMedia({ audio: false, video: v });
  const list = async () => (anyCamera ? [] : (await mediaDevices.enumerateDevices?.()) ?? []);
  // Names are readable once the camera was allowed before: then the phone is never woken.
  const known = otherThanPhone(await list());
  if (known) {
    try { return await ask(only(video, known)); } catch (error) { console.warn("that camera did not open", error); }
  }
  const stream = await ask(video);
  if (!PHONE.test(stream.getVideoTracks?.()[0]?.label ?? "")) return stream;
  const better = otherThanPhone(await list());
  if (!better) return stream; // the phone is the only camera there is
  try {
    const own = await ask(only(video, better));
    stream.getTracks().forEach((t) => t.stop());
    return own;
  } catch (error) {
    console.warn("staying with the first camera", error);
    return stream;
  }
}
