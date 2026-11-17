exports.ok         = (res, data) => res.json(data);
exports.created    = (res, data) => res.status(201).json(data);
exports.bad        = (res, msg)  => res.status(400).json({ message: msg });
exports.unauth     = (res)       => res.status(401).json({ message: 'Unauthorized' });
exports.forbidden  = (res)       => res.status(403).json({ message: 'Forbidden' });
exports.notfound   = (res)       => res.status(404).json({ message: 'Not found' });
