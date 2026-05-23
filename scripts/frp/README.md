# frp 本地检查脚本

这个目录里的脚本只做本地安全检查，不负责安装、下载或启动 frp。

脚本：

- `check-frp-config.sh`：扫描 frp 配置，检查危险默认值、真实 token、dashboard 暴露等问题
- `check-local-cc-web.sh`：检查本机 `http://127.0.0.1:8083/` 是否可访问

边界：

- 不需要 sudo
- 不修改 systemd、npm、shell profile 或系统代理
- 不访问通知 webhook、公网业务接口或用户私有服务
- 不会把真实配置写回仓库

示例：

```bash
bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml deploy/frp/frpc.example.toml
bash scripts/frp/check-local-cc-web.sh
```
