import { createContext,useContext,useState,type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FrameSlot = createContext<{
  leading: HTMLDivElement | null;
  trailing: HTMLDivElement | null;
  setLeading: (element: HTMLDivElement | null) => void;
  setTrailing: (element: HTMLDivElement | null) => void;
} | null>(null);

/** The existing experiment panel owns chrome; the conversation owns its controls. */
export function GroundStationConversationFrameProvider({children}:{children:ReactNode}) {
  const [leading,setLeading] = useState<HTMLDivElement | null>(null);
  const [trailing,setTrailing] = useState<HTMLDivElement | null>(null);
  return <FrameSlot.Provider value={{leading,trailing,setLeading,setTrailing}}>{children}</FrameSlot.Provider>;
}

export function GroundStationConversationHeaderLeading() {
  const frame = useContext(FrameSlot);
  return frame ? <div ref={frame.setLeading} className="ground-station-conversation-header-leading"
    data-xgc-role="ground-station-conversation-header" data-xgc-id="conversation-leading" /> : null;
}

export function GroundStationConversationHeaderActions() {
  const frame = useContext(FrameSlot);
  return frame ? <div ref={frame.setTrailing} className="ground-station-conversation-header-actions"
    data-xgc-role="ground-station-conversation-header" data-xgc-id="conversation-actions" /> : null;
}

export function GroundStationConversationHeaderPortal({
  slot,children,
}:{slot:'leading' | 'trailing'; children:ReactNode}) {
  const frame = useContext(FrameSlot);
  const element = slot === 'leading' ? frame?.leading : frame?.trailing;
  return element ? createPortal(children,element) : null;
}
