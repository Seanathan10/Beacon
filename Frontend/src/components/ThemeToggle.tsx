import { useEffect, useState } from "react";
import { getStoredMode, setStoredMode, ThemeMode } from "@/utils/theme";
import "./styles/ThemeToggle.css";

export default function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>(() => getStoredMode());

	useEffect(() => {
        // pick up external changes (e.g., another tab writing localStorage)
		const sync = () => setMode(getStoredMode());
		window.addEventListener("storage", sync);
		return () => window.removeEventListener("storage", sync);
    }, []);

	return (
		<select
			value={ mode }
			onChange={ (e) => {
				setMode(e.target.value as ThemeMode);
				setStoredMode(e.target.value as ThemeMode);
			}}
		>
		  <option value="system">System</option>
		  <option value="light">Light</option>
		  <option value="dark">Dark</option>
		</select>
    );
}
