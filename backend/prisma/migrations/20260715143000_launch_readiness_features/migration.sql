ALTER TABLE `User`
  ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `bannedAt` DATETIME(3) NULL,
  ADD COLUMN `banReason` VARCHAR(255) NULL,
  ADD COLUMN `riskScore` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `User_status_idx` ON `User`(`status`);
CREATE INDEX `User_riskScore_idx` ON `User`(`riskScore`);

CREATE TABLE `ExternalCreditRecharge` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `requestId` VARCHAR(80) NOT NULL,
  `userId` INTEGER NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `externalPaymentId` VARCHAR(191) NULL,
  `amount` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PAID',
  `note` VARCHAR(255) NULL,
  `rawPayload` TEXT NULL,
  `creditedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ExternalCreditRecharge_requestId_key`(`requestId`),
  INDEX `ExternalCreditRecharge_userId_idx`(`userId`),
  INDEX `ExternalCreditRecharge_provider_idx`(`provider`),
  INDEX `ExternalCreditRecharge_status_idx`(`status`),
  INDEX `ExternalCreditRecharge_createdAt_idx`(`createdAt`),
  CONSTRAINT `ExternalCreditRecharge_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `RiskEvent` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NULL,
  `playSessionId` INTEGER NULL,
  `type` VARCHAR(64) NOT NULL,
  `severity` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  `message` VARCHAR(255) NOT NULL,
  `metadata` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `RiskEvent_userId_idx`(`userId`),
  INDEX `RiskEvent_playSessionId_idx`(`playSessionId`),
  INDEX `RiskEvent_type_idx`(`type`),
  INDEX `RiskEvent_status_idx`(`status`),
  INDEX `RiskEvent_severity_idx`(`severity`),
  INDEX `RiskEvent_createdAt_idx`(`createdAt`),
  CONSTRAINT `RiskEvent_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `RiskEvent_playSessionId_fkey`
    FOREIGN KEY (`playSessionId`) REFERENCES `PlaySession`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE `PolicyDocument` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(64) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PolicyDocument_slug_key`(`slug`),
  INDEX `PolicyDocument_status_idx`(`status`)
);

INSERT INTO `PolicyDocument` (`slug`, `title`, `content`, `status`, `createdAt`, `updatedAt`)
VALUES
  (
    'terms',
    '用户协议',
    '欢迎使用本服务。用户应确保其访问、购买、观看和使用行为符合所在地法律法规及平台规则。用户不得以任何形式录屏、下载、传播、转卖、共享账号、共享播放链接或规避水印与风控机制。平台有权根据订单、播放会话、设备、IP、账号行为和水印信息进行风控审核，并对违规账号采取限制播放、撤销权限、封禁账号等措施。用户使用本服务即视为同意本协议及相关规则。',
    'PUBLISHED',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  ),
  (
    'refund',
    '退款说明',
    '本服务提供的内容属于虚拟数字内容、即时授权内容或项目内积分服务。订单支付成功、积分到账或视频播放权限开通后，原则上不提供退款服务。因用户自身原因造成的误购、重复购买、账号共享、设备异常、网络环境问题或违反规则导致的限制使用，不作为退款理由。若法律法规、司法机关、监管要求或 Telegram 等平台规则明确要求处理退款，本服务将按强制要求执行。',
    'PUBLISHED',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  ),
  (
    'ban-rules',
    '封号规则',
    '为保护内容权益与正常用户体验，平台禁止录屏、截图传播、二次转卖、倒卖账号、共享订单、共享播放窗口、批量异常播放、绕过水印、攻击接口、伪造支付或恶意退款。平台会依据订单水印、播放会话、IP、设备环境、账号行为、支付记录与用户举报进行判断。确认违规后，平台可封禁账号、撤销观看权限、清零违规所得积分，并保留进一步追究责任的权利。',
    'PUBLISHED',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  ),
  (
    'copyright',
    '版权声明',
    '本服务中的视频、图片、文字、页面设计、商标标识及相关素材受版权、商标权或其他权益保护。未经授权，任何用户不得复制、录制、下载、转载、剪辑、传播、售卖或用于商业用途。若权利人认为平台内容涉及侵权，请通过平台公布的联系方式提交权属证明、侵权链接和处理要求，平台将在核实后依法处理。',
    'PUBLISHED',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  )
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `status` = VALUES(`status`),
  `updatedAt` = CURRENT_TIMESTAMP(3);
