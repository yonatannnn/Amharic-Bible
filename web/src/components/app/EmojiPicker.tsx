"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A self-contained, dependency-free emoji picker. Renders a categorized,
 * scrollable grid of a few hundred hardcoded emojis. Used by the chat to set
 * a per-message reaction.
 */

type Category = { name: string; icon: string; emojis: string[] };

const CATEGORIES: Category[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "🫠", "😉",
      "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲", "😋",
      "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🤫", "🤔", "🫡", "🤐",
      "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌",
      "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶",
      "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟",
      "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰",
      "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤",
      "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👻", "👽", "🤖",
    ],
  },
  {
    name: "Gestures",
    icon: "👍",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
      "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
      "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🙏",
      "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀",
      "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "🫦", "👶", "🧒", "👦", "👧",
      "🧑", "👨", "👩", "🧓", "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋",
      "🧏", "🙇", "🤦", "🤷", "👮", "🕵️", "💂", "👷", "🤴", "👸", "👰", "🤵",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥",
      "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️",
      "💌", "💋", "💯", "💢", "💥", "💫", "💦", "💨", "🕳️", "💬", "🗯️", "💭",
      "💤", "🌟", "⭐", "✨", "⚡", "🔥", "🌈", "☀️", "🌙", "💎", "🎀", "🎉",
    ],
  },
  {
    name: "Animals",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁",
      "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦",
      "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝",
      "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🦗", "🕷️", "🦂", "🐢",
      "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟",
      "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛",
      "🦏", "🐪", "🐫", "🦒", "🦘", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑",
      "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢",
    ],
  },
  {
    name: "Food",
    icon: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️",
      "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖",
      "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🌭",
      "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕",
      "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘",
      "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂",
      "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼",
      "☕", "🍵", "🧃", "🥤", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹",
    ],
  },
  {
    name: "Activities",
    icon: "⚽",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓",
      "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿",
      "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂",
      "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽",
      "🚣", "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎗️",
      "🎫", "🎟️", "🎪", "🤹", "🎭", "🩰", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹",
      "🥁", "🎷", "🎺", "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰",
    ],
  },
  {
    name: "Travel",
    icon: "✈️",
    emojis: [
      "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚",
      "🚛", "🚜", "🦯", "🦽", "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔",
      "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅",
      "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🚁",
      "🚀", "🛸", "🛶", "⛵", "🚤", "🛥️", "🛳️", "⛴️", "🚢", "⚓", "🪝", "⛽",
      "🚧", "🚦", "🚥", "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢",
      "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻", "🏕️", "⛺",
    ],
  },
  {
    name: "Objects",
    icon: "💡",
    emojis: [
      "⌚", "📱", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🕹️", "💽", "💾", "💿", "📷",
      "📸", "📹", "🎥", "📞", "☎️", "📟", "📺", "📻", "🧭", "⏱️", "⏰", "🕰️",
      "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💸", "💵",
      "💴", "💶", "💷", "🪙", "💰", "💳", "🧾", "⚖️", "🪜", "🧰", "🔧", "🔨",
      "⚒️", "🛠️", "⛏️", "🔩", "⚙️", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🔪",
      "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "🪦", "🔮", "📿", "🧿", "💈", "⚗️", "🔭",
      "🔬", "🕳️", "🩹", "🩺", "💊", "💉", "🧬", "🦠", "🧫", "🧪", "🌡️", "🧹",
      "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🛀", "🧼", "🪒", "🧽", "🪣", "🔑",
    ],
  },
  {
    name: "Symbols",
    icon: "🔣",
    emojis: [
      "✅", "❌", "❎", "✔️", "☑️", "✖️", "➕", "➖", "➗", "♾️", "‼️", "⁉️",
      "❓", "❔", "❗", "❕", "〰️", "💲", "💱", "©️", "®️", "™️", "🔝", "🔚",
      "🔙", "🔛", "🔜", "✳️", "✴️", "❇️", "🆚", "🉑", "🈸", "🈺", "🈷️", "✴️",
      "🆑", "🆘", "🆔", "🆕", "🆖", "🆗", "🆙", "🆓", "🅰️", "🅱️", "🆎", "🅾️",
      "🔰", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚭", "❗", "🔅",
      "🔆", "〽️", "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️",
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "🔴", "🟠", "🟡",
      "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶", "🔷",
    ],
  },
];

// A short set of recents shown first for one-tap access.
const QUICK = ["❤️", "😂", "👍", "🙏", "🔥", "😮", "😢", "🎉"];

export function EmojiPicker({
  onPick,
  onClose,
  anchorMine,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** When true, anchors the popover to the right edge (my own messages). */
  anchorMine?: boolean;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-50 mt-1 w-[300px] rounded-2xl border border-line bg-surface shadow-card ${
        anchorMine ? "right-0" : "left-0"
      }`}
    >
      {/* quick row */}
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {QUICK.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-surface-2"
          >
            {e}
          </button>
        ))}
      </div>

      {/* scrollable grid */}
      <div className="max-h-56 overflow-y-auto p-2">
        <div className="mb-1 px-1 text-[11px] font-semibold text-ink-faint">
          {CATEGORIES[active].name}
        </div>
        <div className="grid grid-cols-8 gap-0.5">
          {CATEGORIES[active].emojis.map((e, i) => (
            <button
              key={`${e}-${i}`}
              onClick={() => onPick(e)}
              className="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-surface-2"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* category tabs */}
      <div className="flex items-center justify-between border-t border-line px-1.5 py-1.5">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setActive(i)}
            title={c.name}
            className={`grid h-7 w-7 place-items-center rounded-lg text-base ${
              i === active ? "bg-brand-soft" : "hover:bg-surface-2"
            }`}
          >
            {c.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
