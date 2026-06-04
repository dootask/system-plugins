# MySQL Port Exposure Plugin

## Overview
This plugin allows you to expose MySQL database ports in DooTask. With it, you can map your MySQL database port to the host, making it easier for external tools to connect and manage your database.

## Key Features
- Customizable proxy port
- Simple and user-friendly configuration interface
- Secure and reliable port mapping

## Configuration
The plugin provides the following configuration option:

### Proxy Port (PROXY_PORT)
- Type: Number
- Default: 3306
- Description: Set the MySQL port to expose
- Recommendation: For security, avoid using the default port 3306 unless necessary. Use a different port if possible.

## How to Use
1. Install this plugin from the DooTask App Store
2. Go to the plugin configuration page
3. Set your desired proxy port
4. Save the configuration and enable the plugin

## Installation
1. Find and install this plugin from the DooTask App Store
2. The plugin will be enabled automatically after installation—no extra steps required
3. Default settings are optimized for most scenarios; you can further customize them in the plugin settings if needed
4. ⚠️ The plugin is large (about 20MB); installation may take some time. Please check the installation log for progress

## Notes
- Make sure the selected port is not used by other services
- Use caution in production environments and implement proper security measures
- Close the exposed port when not needed to ensure database security

## Support
For any questions or suggestions, please visit our official website: https://www.dootask.com