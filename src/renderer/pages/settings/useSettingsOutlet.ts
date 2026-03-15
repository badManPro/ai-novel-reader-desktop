import { useOutletContext } from 'react-router-dom';
import { useSettingsState } from '../../hooks/useSettingsState';

export function useSettingsOutlet() {
  return useOutletContext<ReturnType<typeof useSettingsState>>();
}
