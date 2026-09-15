"""
Custom Keras layers required to load the V2 model.
Compatible with both Keras 2.x (tf.keras) and Keras 3.x.
"""
import tensorflow as tf

try:
    import keras
    # Keras 3.x: register custom objects via decorator
    _register = keras.saving.register_keras_serializable(package="Custom")
except (ImportError, AttributeError):
    # Keras 2.x fallback: no-op decorator
    def _register(cls):
        return cls


@_register
class LearnablePositionalEncoding(tf.keras.layers.Layer):
    """Adds a learnable positional encoding to the input sequence."""

    def __init__(self, seq_len, d_model, **kwargs):
        super().__init__(**kwargs)
        self.seq_len = seq_len
        self.d_model = d_model

    def build(self, input_shape):
        self.pe = self.add_weight(
            name="positional_encoding",
            shape=(1, self.seq_len, self.d_model),
            initializer="glorot_uniform",
            trainable=True,
        )

    def call(self, x):
        return x + self.pe

    def get_config(self):
        config = super().get_config()
        config.update({"seq_len": self.seq_len, "d_model": self.d_model})
        return config


@_register
class TemporalAttentionPooling(tf.keras.layers.Layer):
    """
    Learns which timesteps matter most for prediction.
    Returns (context_vector, alpha_weights) as a tuple.
    """

    def __init__(self, hidden_dim=64, **kwargs):
        super().__init__(**kwargs)
        self.hidden_dim = hidden_dim

    def build(self, input_shape):
        feat_dim = input_shape[-1]
        self.W1 = self.add_weight(
            name="attn_W1",
            shape=(feat_dim, self.hidden_dim),
            initializer="glorot_uniform",
            trainable=True,
        )
        self.b1 = self.add_weight(
            name="attn_b1",
            shape=(self.hidden_dim,),
            initializer="zeros",
            trainable=True,
        )
        self.v = self.add_weight(
            name="attn_v",
            shape=(self.hidden_dim, 1),
            initializer="glorot_uniform",
            trainable=True,
        )

    def call(self, x):
        score = tf.tanh(tf.matmul(x, self.W1) + self.b1)
        score = tf.matmul(score, self.v)
        alpha = tf.nn.softmax(score, axis=1)
        context = tf.reduce_sum(alpha * x, axis=1)
        return context, alpha

    def get_config(self):
        config = super().get_config()
        config.update({"hidden_dim": self.hidden_dim})
        return config


def asymmetric_huber_loss(y_true, y_pred):
    """Asymmetric Huber loss with proximity weighting."""
    diff = y_pred - y_true
    abs_diff = tf.abs(diff)
    delta = 0.1
    huber = tf.where(
        abs_diff <= delta,
        0.5 * tf.square(diff),
        delta * abs_diff - 0.5 * delta ** 2,
    )
    asym_w = tf.where(diff > 0, 2.0, 1.0)
    prox_w = 1.0 + 3.0 * tf.exp(-5.0 * y_true)
    return tf.reduce_mean(asym_w * prox_w * huber)


# Registry used by tf.keras.models.load_model(custom_objects=...)
CUSTOM_OBJECTS = {
    "asymmetric_huber_loss": asymmetric_huber_loss,
    "LearnablePositionalEncoding": LearnablePositionalEncoding,
    "TemporalAttentionPooling": TemporalAttentionPooling,
}
