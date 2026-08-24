import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "少模光纤单光斑仿真器",
  description: "根据光纤参数自动识别 LP 模式，设置模态幅度与相位并生成单张少模光斑。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
